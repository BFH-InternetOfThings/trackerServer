/**
 * Created by Roger Jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var atFormat = require('./atformat');
var debug = require('debug')('atformattcpsrv');
var S = require('string');
var Long = require("long");

// Start a TCP Server
module.exports = net.createServer(function (socket) {

    // Identify this client
    socket.isASCIIFormat = true;
    socket.trackerID = null;
    socket.commandQueue = [];
    socket.lastTransactionID = 0;
    socket.deviceType = null;

    socket.sendCommand = function (newCommand) {

        if(newCommand) {
            if (newCommand.isValid()) {

                if (!socket.trackerID) {
                    // the Tracker sends a hearbeat after every connect
                    // if trackerID is null, then this heartbeat didn't get in until now
                    newCommand.finishAndCallCallback(socket, "No commands can be sent until initial tracker handshake is done");
                }

                socket.commandQueue.push(newCommand);
            }
            else {
                newCommand.finishAndCallCallback(socket, null);
            }
        }

        if (socket.commandQueue.length == 0) {
            // return on empty queue
            return;
        }

        var commandObject = socket.commandQueue[0];

        if (commandObject.sentTime) {
            // Currently a command is executing, wait until that command finishes
            return;
        }

        var timeoutInSeconds = 20;
        commandObject.setStatusSent(setTimeout(function(commandObj) {
            // if the result is still null, then we didn't get a response
            // in this case quit the command from the queue
            if(!commandObj.finishedTime) {
                for (var i = 0; i < socket.commandQueue.length; i++) {
                    if( socket.commandQueue[i] == commandObj ) {
                        socket._quitCommands(i, 1, "Timeout while waiting for data for command " + commandObj.command);
                        return;
                    }
                }
            }
        }, timeoutInSeconds * 1000, commandObject));


        if (socket.isASCIIFormat) {
            socket.write(commandObject.getCommandString());
            debug("Sent to tracker " + socket.trackerID, commandObject.getCommandString());
        }
        else {
            socket.write(atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.getCommandString()));
            debug("Sent to tracker " + socket.trackerID, commandObject.getCommandString());
        }
    };

    socket._setTrackerID = function(id) {
        var idString = S(id);

        if(!idString.isEmpty() && idString.isNumeric()) {
            var newId = idString.toString();
            var oldId = socket.trackerID;

            var sentConnectedMessage = socket.trackerID == 0 || socket.trackerID == null;
            var sentIdChangedMessage = !(oldId === newId);

            socket.trackerID = newId;

            if(sentConnectedMessage) module.exports.emit("trackerConnected", socket);
            if(sentIdChangedMessage && !sentConnectedMessage) module.exports.emit("trackerIdChanged", socket, oldId);
        }
        else {
            socket.sendCommand("MODID", "", function (err, tracker, response) {
                 if (err) {
                    console.log(err);
                 }
                 else {
                     socket._setTrackerID(response[0]);
                 }
             });
        }
    };

    socket._quitCommands = function (startIndex, count, errorText) {
        // it it is not the first command, all commands before it failed. Remove then and call their callbacks
        var commands = socket.commandQueue.splice(startIndex, count);

        for (var i = 0; i < commands.length; i++) {
            commands[i].finishAndCallCallback(socket, errorText);
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
                        socket._quitCommands(i, 1, null);
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
    socket.on('data', function(data) {

        // check for ASCII Heartbeat Message
        if (data.readUInt16BE(0) == 0xfaf8) {
            // CareU1 Heartbeat
            try {

                var asciiAck = atFormat.atASCIIAcknowledge.parse(data);

                socket.deviceType = atFormat.DeviceTypes.CAREU1_TRACKER;
                socket.isASCIIFormat = true;

                socket._setTrackerID(asciiAck.modemID);

                module.exports.emit('heartbeatReceived', socket, asciiAck.sequenceID);

                // answer handshake
                socket.write(data);

                return;
            }
            catch (err) {
                debug(err, data);
            }
        }
        else if (data.readUInt16BE(0) == 0xfaf9) {
            // Netmodule Heartbeat
            try {
                var sequenceID = S(data.toString('ascii', 2, 4)).toInteger();
                var modemID = S(data.toString('ascii', 4)).toInteger();

                socket.deviceType = atFormat.DeviceTypes.NETMODULE;
                socket.isASCIIFormat = true;
                cnosole.log("got Heartbeat", sequenceID, modemID);

                socket._setTrackerID(modemID);

                module.exports.emit('heartbeatReceived', socket, sequenceID);

                // answer handshake
                socket.write(data);

                return;
            }
            catch (err) {
                debug(err, data);
            }
        }

        // Check for Binary format
        try {
            var packet = atFormat.atBinaryResponsePacket.parse(data);

            debug("Received from tracker " + socket.trackerID, packet);

            // binary protocoll is only supported on CAREU1 Tracker
            socket.deviceType = atFormat.DeviceTypes.CAREU1_TRACKER;
            socket.isASCIIFormat = false;
            socket.lastTransactionID = packet.transactionID;
        }
        catch (err) {
            if (socket.isASCIIFormat = false) {
                console.log(err);
            }

            // Process ASCII Message
            socket.isASCIIFormat = true;
            debug("Received from tracker " + socket.trackerID, data.toString('ascii'));

            socket._processDataLine(data.toString('ascii'));
            return;
        }

        // Process Binary Message
        switch (packet.messageEncoding) {
            case 0x00: //atFormat.atAsyncStatusMessage,
                var modemIDOrIMEI = (new Long(packet.message.modemID2, packet.message.modemID1, true)).toString();

                if (packet.message.messageID == 0xAB) {
                    // heartbeat
                    socket._setTrackerID(modemIDOrIMEI);

                    module.exports.emit('heartbeatReceived', socket, packet.transactionID);
                }
                else {

                    // handle the annoying 24-bit signed integer for altitude
                    var altitudeBuffer = new Buffer([packet.message.data.altitude1, packet.message.data.altitude2, packet.message.data.altitude3, 0x00]);
                    var altitude = altitudeBuffer.readInt32BE(0) / Math.pow(2, 8); // convert to a 32 bit integer (signed / unsigned) and then divide last 8 bits away

                    // GPS Position
                    var gpsObj = {
                        modemIDorIMEI: modemIDOrIMEI,
                        devicetime: atFormat.getMomentFromBinaryObject(packet.message.data.rtc).toDate(),
                        gpstime: atFormat.getMomentFromBinaryObject(packet.message.data.gps).toDate(),
                        latitude: packet.message.data.latitude / 100000,
                        longitude: packet.message.data.longitude / 100000,
                        altitude: altitude,
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

    /*
    socket.on('close', function(had_error) {
        module.exports.clients.splice(module.exports.clients.indexOf(socket), 1);
        module.exports.emit("trackerDisconnected", socket, had_error);
    });
    */

    // Put this new client in the list
    module.exports.clients.push(socket);
});

module.exports.clients = [];

module.exports.AtCommand = atFormat.AtCommand;
module.exports.DeviceTypes = atFormat.DeviceTypes;

module.exports.sendCommand = function (trackerID, command, newValue, callback) {

    var newCommand = new atFormat.AtCommand(command, newValue, callback);

    var trackerIDString = S(trackerID);

    if(trackerIDString.isEmpty()) {
        newCommand.finishAndCallCallback(null, 'Tracker id is empty!');
        return;
    }

    if(!trackerIDString.isNumeric()) {
        newCommand.finishAndCallCallback(null, 'Tracker id ' + trackerID + ' is not numeric!');
        return;
    }

    trackerID = trackerIDString.toString();

    for (var i = 0; i < module.exports.clients.length; i++) {
        var client = module.exports.clients[i];
        if (client.trackerID && client.trackerID === trackerID) {
            client.sendCommand(newCommand);
            return;
        }
    }

    newCommand.finishAndCallCallback(null, 'Tracker id ' + trackerID + ' not found!');
};
