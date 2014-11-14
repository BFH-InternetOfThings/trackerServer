/**
 * Created by roger.jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var atFormat = require('./atformat');
var debug = require('debug')('atFormatTCPSrv');
var S = require('string');

// Start a TCP Server
module.exports = net.createServer(function (socket) {

    // Identify this client
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    //socket.isInitHandshakeDone = false;
    socket.isASCIIFormat = true;
    socket.trackerID = null;
    socket.commandQueue = [];
    socket.lastTransactionID = 0;


    socket.sendCommand = function(command, newValue, callback) {

        if(command) {
            socket.commandQueue.push(new atFormat.AtCommand(command, newValue, callback));
        }

        if(!socket.commandQueue || socket.commandQueue.length == 0) {
            return;
        }

        if(!socket.trackerID && socket.commandQueue[0].command !== "MODID" ) {
            // do not send a command until the initial handshake is done
            return;
        }

        var commandObject = socket.commandQueue[0];

        if(commandObject.sentTime) {
            // Currently a command is executing, wait until that command finishes
            // TODO: Add Timeout handling for 10 seconds, this also needs an additonal timer who checks for responses within 10s
            return;
        }

        commandObject.setStatusSent();
        if(socket.isASCIIFormat) {
            console.log("Send command: ", commandObject.getCommandString());
            socket.write(commandObject.getCommandString());
        }
        else {
            console.log("Send command: ", commandObject.getCommandString(), atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.getCommandString()));
            socket.write(atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.getCommandString()));
        }
    };

    socket._quitCommands = function(startIndex, count) {
        // it it is not the first command, all commands before it failed. Remove then and call their callbacks
        var commands = socket.commandQueue.splice(startIndex, count);

        for(var i = 0; i < commands.length; i++) {
            commands[i].callCallback(socket);
        }
    };

    socket._processDataLine = function(line) {

        if(S(line).isEmpty()) return;


        if(socket.commandQueue.length > 0) {

            for(var i = 0; i < socket.commandQueue.length; i++) {
                switch(socket.commandQueue[0].parseLine(line)) {
                    case atFormat.ATCommandReturnCode.AWAIT_MORE_DATA:
                        return;

                    case atFormat.ATCommandReturnCode.SUCCESSFULLY_FINISHED:
                        socket._quitCommands(0, i+1);
                        return;

                    case atFormat.ATCommandReturnCode.WRONG_COMMAND:
                        break;

                    case atFormat.ATCommandReturnCode.UNKNOWN_DATA:
                    default:
                        i = socket.commandQueue.length; // break the loop
                }
            }
        }

        // parse for async data
        var result;

        // async Data like GPS, etc.
        result = atFormat.parseASCII_TXT(line);
        if (result != null) {
            socket.emit('TxtDataReceived', result);
            return;
        }

        result = atFormat.parseASCII_Garmin(line);
        if (result != null) {
            socket.emit('GarminDataReceived', result);
            return;
        }

        result = atFormat.parseASCII_OBD(line);
        if (result != null) {
            socket.emit('OBDDataReceived', result);
            return;
        }

        // GPS must be at the end, because GPS has no
        result = atFormat.parseASCII_GPS(line);
        if (result != null) {
            module.exports.emit('gpsDataReceived', socket, result);
            return;
        }

        debug('Unrecognised data: ' + line);
    };

    // Handle incoming messages from clients.
    socket.on('data', function (data) {

        // check for ASCII Heartbeat Message
        if(data.readUInt16BE(0) == 0xfaf8) {
            try {
                var asciiAck = atFormat.atASCIIAcknowledge.parse(data);

                // answer handshake
                socket.write(data);

                socket.isASCIIFormat = true;
                debug("ASCII Heartbeat no. " + asciiAck.sequenceID + " from modem id " + asciiAck.modemID + " received!");
                return;
            }
            catch(err) {
                debug(err,data);
            }
        }

        // Check for Binary format
        try {
            var packet = atFormat.atBinaryResponsePacket.parse(data);

            socket.isASCIIFormat = false;
            socket.lastTransactionID = packet.transactionID;
        }
        catch(err) {
            console.log(err);

            // Process ASCII Message
            socket.isASCIIFormat = true;
            socket._processDataLine(data.toString('ascii'));
            return;
        }

        // Process Binary Message
        switch(packet.messageEncoding) {
            case 0x00: //atFormat.atAsyncStatusMessage,
                if (packet.message.messageID == 0xAB) {
                    // heartbeat
                    debug("Binary Heartbeat no. " + packet.transactionID + " from modem id " + packet.message.modemID2 + " received!");
                }
                else {
                    // GPS Position
                    var gpsObj = {
                        devicetime: atFormat.getMomentFromBinaryObject(packet.message.data.rtc).toDate(),
                        gpstime: atFormat.getMomentFromBinaryObject(packet.message.data.gps).toDate(),
                        latitude: packet.message.data.latitude / 100000,
                        longitude: packet.message.data.longitude / 100000,
                        altitude: packet.message.data.altitude2,
                        speed: packet.message.data.speed,
                        direction: packet.message.data.direction,
                        satelliteCount: packet.message.data.satelliteCount
                    };

                    module.exports.emit('gpsDataReceived', socket, gpsObj);
                }
                break;
            case 0x01: //atFormat.atCommandResponse,

                var lines = packet.message.messageData.toString().replace('\r\n', '\n').replace('\r', '\n').split("\n");

                for (var j = 0; j < lines.length; j++) {
                    socket._processDataLine(lines[j]);
                }

                break;
            case 0x02: //atFormat.atAsyncTextMessage,
            case 0x03: //atFormat.atAsyncTextMessage,
            case 0x04: //atFormat.atAsyncTextMessage

                break;
            default:

        }

        // Acknowledge async messages
        if(packet.messageType == 0x02) {
            // answer async message with acknowledge
            socket.write(atFormat.generateBinaryAcknowledge(packet.transactionID, true));
        }
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        module.exports.clients.splice(module.exports.clients.indexOf(socket), 1);
        console.log('client' + socket.name + ' disconnected!');
    });

    // Put this new client in the list
    module.exports.clients.push(socket);

    // check the mod id
    socket.sendCommand("MODID", "", function(err, tracker, response) {
        if(err) {
            console.log(err);
        }
        else {
            socket.trackerID = response[0];
            module.exports.emit("trackerConnected", socket);
        }
    });

    //socket.write("AT$MODID?");



});

module.exports.clients = [];


module.exports.sendCommand = function(trackerID, command, newValue, callback) {

    for(var i = 0; i < module.exports.clients.length; i++) {
        var client = module.exports.clients[i];
        if(client.trackerID) {
            if(client.trackerID === trackerID) {
                client.sendCommand(command, newValue, callback);
                return;
            }
        }
    }

    callback(new Error('Tracker id ' + trackerID + ' not found!'));
};

/*
module.exports.broadcastCommand = function(command, newValue, callback) {
    clients.forEach(function (client) {
        client.registerCommand(command, newValue, callback);
    });
};

// Send a message to all clients
function broadcast(message) {
    clients.forEach(function (client) {
        console.log("--> send " + message + " to client " + client.name);
        // only send if inital Handshake is done, otherwise the tracker won't answer the query
        if (client.isASCIIFormat != null) {
            if(client.isASCIIFormat == true) {
                client.write(message);
            }
            else {
                client.sendBinaryCommand(message);
            }
        }
    });
}

// Put a friendly message on the terminal of the server.
console.log("Tissan Tracker server running at port 9090\n");
*/


