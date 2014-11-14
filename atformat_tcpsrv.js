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
    socket.isASCIIFormat = null;
    socket.trackerID = null;
    socket.commandQueue = [];
    socket.lastTransactionID = 0;


    socket.sendCommand = function(command, newValue, callback) {

        if(command) {
            socket.commandQueue.push(new atFormat.AtCommand(command.toString(), newValue, callback));
        }

        if(!socket.commandQueue || socket.commandQueue.length == 0) {
            return;
        }

        if(!socket.trackerID) {
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
            socket.write(commandObject.getCommandString());
        }
        else {
            socket.write(atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.getCommandString()));
        }
    };

    socket._quitCommands = function(startIndex, count) {
        // it it is not the first command, all commands before it failed. Remove then and call their callbacks
        var commands = socket.commandQueue.splice(startIndex, count);

        for(var i = 0; i < commands.length; i++) {
            commands[i].callCallback();
        }
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
                debug("Heartbeat no. " + asciiAck.sequenceID + " from modem id " + asciiAck.modemID + " received!");
                return;
            }
            catch(err) {
                debug(err,data);
            }
        }

        if(socket.isASCIIFormat) { // parse ascii format

            var dataString = data.toString('ascii');

            if(socket.commandQueue.length > 0 && socket.commandQueue[0].sentTime) {
                if(socket.commandQueue[0].parseCommandData(dataString)) {
                    // command is complete, remove it from list
                    socket._quitCommands(0, 1);
                }
            }

            var result = atFormat.getASCIICommandResponse(dataString);
            if(result != null) {
                if (socket.commandQueue.length == 0) {
                    debug('got an command response, but no command is in the queue. Maybe the timeout already removed it.');
                    return;
                }

                var found = false;

                for(var i = 0; i < socket.commandQueue.length; i++) {
                    if(socket.commandQueue[i].command == result) {
                        found = true;

                        if(i != 0) {
                            socket._quitCommands(0, i);
                        }
                        break;
                    }
                }

                if(found) {
                    if(socket.commandQueue[0].parseCommandHeader(dataString)) {
                        // command is complete, remove it from list
                        socket._quitCommands(0, 1);
                    }
                }
                else {
                    debug('got an command response, but the command was not found in the queue. Maybe the timeout already removed it.');
                }

                return;
            }

            // async Data like GPS, etc.
            result = atFormat.parseASCII_TXT(dataString);
            if (result != null) {
                socket.emit('onAsyncTXT', result);
                return;
            }

            result = atFormat.parseASCII_Garmin(dataString);
            if (result != null) {
                socket.emit('onAsyncGarmin', result);
                return;
            }

            result = atFormat.parseASCII_OBD(dataString);
            if (result != null) {
                socket.emit('onAsyncOBD', result);
                return;
            }

            // GPS must be at the end, because GPS has no
            result = atFormat.parseASCII_GPS(dataString);
            if (result != null) {
                socket.emit('onAsyncGPS', result);
                return;
            }

            debug('Unrecognised data: ' + dataString);

        }
        else { // parse binary format
            socket.isASCIIFormat = false;

            // Binary format
            try {
                var packet = atFormat.atBinaryResponsePacket.parse(data);
            }
            catch(err) {
                console.log(err);
                console.log(data);
                socket.write(atFormat.generateBinaryAcknowledge(data.readUInt16BE(0), false));
                return;
            }

            //console.log(packet.message);

            socket.lastTransactionID = packet.transactionID;

            switch(packet.messageEncoding) {
                case 0x00: //atFormat.atAsyncStatusMessage,
                    if (packet.message.messageID == 0xAB) {
                        // heartbeat
                        debug("Heartbeat no. " + packet.transactionID + " from modem id " + packet.message.modemID2 + " received!");
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

                    var stringData = packet.message.messageData;
                    console.log(stringData);

                    var lines = stringData.replace('\r\n', '\n').replace('\r', '\n').split("\n");

                    if (socket.commandQueue.length == 0) {
                        var line1 = S(lines[0]);
                        var line2 = S(lines[1]);
                        if (line1.startsWith("OK:MODID") && line2.startsWith("$MODID=")) {
                            socket.trackerID = line2.substring(7).toInteger();
                        }
                        else {

                        }
                    }
                    else {
                            socket.commandQueue[0].parseCommandHeader(lines[0]);

                            for (var j = 1; j < lines.length; j++) {
                                socket.commandQueue[0].parseCommandData(lines[j]);
                            }

                            // command is complete, remove it from list
                            socket._quitCommands(0, 1);
                    }

                    break;
                case 0x02: //atFormat.atAsyncTextMessage,
                case 0x03: //atFormat.atAsyncTextMessage,
                case 0x04: //atFormat.atAsyncTextMessage

                    break;
                default:

            }


            // Check for async answer
            if(packet.messageType == 0x02) {
                // answer async message with acknowledge
                socket.write(atFormat.generateBinaryAcknowledge(packet.transactionID, true));
            }
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
    socket.write("AT$MODID?");


    module.exports.emit("trackerConnected", socket);
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


