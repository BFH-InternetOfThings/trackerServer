/**
 * Created by Roger Jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var atFormat = require('./atformat');
var debug = require('debug')('atFormatTCPSrv');
var S = require('string');

// Start a TCP Server
module.exports = net.createServer(function (socket) {

    // Identify this client
    socket.isASCIIFormat = true;
    socket.trackerID = null;
    socket.commandQueue = [];
    socket.lastTransactionID = 0;


    socket.sendCommand = function (command, newValue, callback) {

        var newCommand = new atFormat.AtCommand(command, newValue, callback);

        if (!socket.trackerID) {
            // do not send a command until the initial handshake is done
            newCommand.callCallback(socket);

            command = "MODID";
            newCommand = new atFormat.AtCommand(command, "", function (err, tracker, response) {
                if (err) {
                    console.log(err);
                }
                else {
                    socket.trackerID = response[0];
                    module.exports.emit("trackerConnected", socket);
                }
            });
        }

        // TODO: Refactor useless command-is-empty query instead of newCommand query, dahaa
        if (command) {
            socket.commandQueue.push(newCommand);
        }

        if (socket.commandQueue.length == 0) {
            // return on empty queue
            return;
        }

        var commandObject = socket.commandQueue[0];

        if (commandObject.sentTime) {
            // Currently a command is executing, wait until that command finishes
            // TODO: Add Timeout handling for 10 seconds, this also needs an additional timer who checks for responses within 10s!
            return;
        }

        commandObject.setStatusSent();
        if (socket.isASCIIFormat) {
            socket.write(commandObject.getCommandString());
        }
        else {
            socket.write(atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.getCommandString()));
        }
    };

    socket._quitCommands = function (startIndex, count) {
        // it it is not the first command, all commands before it failed. Remove then and call their callbacks
        var commands = socket.commandQueue.splice(startIndex, count);

        for (var i = 0; i < commands.length; i++) {
            commands[i].callCallback(socket);
        }

        // send next command from the queue
        socket.sendCommand();
    };

    socket._processDataLine = function (line) {

        if (S(line).isEmpty()) return;

        if (socket.commandQueue.length > 0) {
            for (var i = 0; i < socket.commandQueue.length; i++) {
                switch (socket.commandQueue[0].parseLine(line)) {
                    case atFormat.ATCommandReturnCode.AWAIT_MORE_DATA:
                        return;

                    case atFormat.ATCommandReturnCode.SUCCESSFULLY_FINISHED:
                        socket._quitCommands(0, i + 1);
                        return;

                    case atFormat.ATCommandReturnCode.WRONG_COMMAND:
                        break;

                    case atFormat.ATCommandReturnCode.UNKNOWN_DATA: // Fall through default

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
            module.exports.emit('TxtDataReceived', socket, result);
            return;
        }

        result = atFormat.parseASCII_Garmin(line);
        if (result != null) {
            module.exports.emit('GarminDataReceived', socket, result);
            return;
        }

        result = atFormat.parseASCII_OBD(line);
        if (result != null) {
            module.exports.emit('OBDDataReceived', socket, result);
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
        if (data.readUInt16BE(0) == 0xfaf8) {
            try {
                var asciiAck = atFormat.atASCIIAcknowledge.parse(data);

                // answer handshake
                socket.write(data);

                socket.isASCIIFormat = true;
                debug("ASCII Heartbeat no. " + asciiAck.sequenceID + " from modem id " + asciiAck.modemID + " received!");
                return;
            }
            catch (err) {
                debug(err, data);
            }
        }

        // Check for Binary format
        try {
            var packet = atFormat.atBinaryResponsePacket.parse(data);

            socket.isASCIIFormat = false;
            socket.lastTransactionID = packet.transactionID;
        }
        catch (err) {
            console.log(err);

            // Process ASCII Message
            socket.isASCIIFormat = true;
            socket._processDataLine(data.toString('ascii'));
            return;
        }

        // Process Binary Message
        switch (packet.messageEncoding) {
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
                        //TODO: Proper implement 24-bit integer data type
                        altitude: packet.message.data.altitude2,
                        speed: packet.message.data.speed / 10,
                        direction: packet.message.data.direction / 10,
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

            case 0x02: //atFormat.atAsyncTextMessage, // Text

                var txtObj = {
                    textMessage: packet.message.textMessage,
                    deviceTime: atFormat.getMomentFromBinaryObject(packet.message.rtc).toDate(),
                    posSendingTime: atFormat.getMomentFromBinaryObject(packet.message.posSending).toDate()
                };

                module.exports.emit('TxtDataReceived', socket, txtObj);
                return;

            case 0x03: //atFormat.atAsyncTextMessage, // Garmin

                var txtObj = {
                    textMessage: packet.message.textMessage,
                    deviceTime: atFormat.getMomentFromBinaryObject(packet.message.rtc).toDate(),
                    posSendingTime: atFormat.getMomentFromBinaryObject(packet.message.posSending).toDate()
                };

                module.exports.emit('GarminDataReceived', socket, txtObj);
                return;

            case 0x04: //atFormat.atAsyncTextMessage  // OBD

                var txtObj = {
                    textMessage: packet.message.textMessage,
                    deviceTime: atFormat.getMomentFromBinaryObject(packet.message.rtc).toDate(),
                    posSendingTime: atFormat.getMomentFromBinaryObject(packet.message.posSending).toDate()
                };

                module.exports.emit('OBDDataReceived', socket, txtObj);
                return;
        }

        // Acknowledge async messages
        if (packet.messageType == 0x02) {
            // answer async message with acknowledge
            socket.write(atFormat.generateBinaryAcknowledge(packet.transactionID, true));
        }
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        module.exports.clients.splice(module.exports.clients.indexOf(socket), 1);
        module.exports.emit("trackerDisconnected", socket);
    });

    // Put this new client in the list
    module.exports.clients.push(socket);

    // get the Tracker id
    socket.sendCommand();

});

module.exports.clients = [];


module.exports.sendCommand = function (trackerID, command, newValue, callback) {

    for (var i = 0; i < module.exports.clients.length; i++) {
        var client = module.exports.clients[i];
        if (client.trackerID && client.trackerID === trackerID) {
            client.sendCommand(command, newValue, callback);
            return;
        }
    }

    callback(new Error('Tracker id ' + trackerID + ' not found!'));
};



