/**
 * Created by roger.jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var atFormat = require('atformat');

// Start a TCP Server
module.exports = net.createServer(function (socket) {

    // Identify this client
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    //socket.isInitHandshakeDone = false;
    socket.isASCIIFormat = null;
    socket.currentCommand = null;
    socket.trackerID = null;
    socket.commandQueue = [];
    socket.lastTransactionID = 0;

    socket.registerCommand = function(command, newValue, callback) {
        if(!command || command == '') {
            callback('empty command');
        }

        var commandString = '';
        if(newValue == undefined || newValue == null || newValue == '') {
            commandString = "at$" + command + "?\n";
        }
        else {
            commandString = "at$" + command + "=" + newValue + "\n";
        }

        socket.commandQueue.push({ commandString: commandString, callback: callback, sentTime: null });

        socket._sendCommandFromQueue();
    };

    socket._sendCommandFromQueue = function() {
        if(!socket.commandQueue || socket.commandQueue.length == 0) {
            return;
        }

        if(!socket.isASCIIFormat) {
            // do not send a command until the initial handshake is done
            return;
        }

        var commandObject = socket.commandQueue[0];

        if(commandObject.sentTime) {
            // Currently a command is executing, wait until that command finishes
            // TODO: Add Timeout handling for 10 seconds, this also needs an additonal timer who checks for responses within 10s
            return;
        }
        commandObject.sentTime = true;

        if(socket.isASCIIFormat) {
            socket.write(commandObject.commandString);
        }
        else {
            socket.write(atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.commandString));
        }
    };

    // Handle incoming messages from clients.
    socket.on('data', function (data) {

        if(data.readUInt16BE(0) == 0xfaf8) {
            try {
                var asciiAck = atFormat.atASCIIAcknowledge.parse(data);

                // answer handshake
                socket.write(data);

                socket.isASCIIFormat = true;
                console.log("Heartbeat no. " + asciiAck.sequenceID + " from modem id " + asciiAck.modemID + " received!");
                return;
            }
            catch(err) {
                console.log(err);
                console.log(data);
            }
        }

        if(socket.isASCIIFormat) { // parse ascii format

            //var string = data.read
            process.stdout.write(data);

            // prompt for a new command for the tracker
            //rl.prompt();

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

            console.log(packet.message);

            socket.lastTransactionID = packet.transactionID;

            // Check for async answer
            if(packet.messageType == 0x02) {
                // answer async message with acknowledge
                socket.write(atFormat.generateBinaryAcknowledge(packet.transactionID, true));
            }
        }
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        clients.splice(clients.indexOf(socket), 1);
        console.log('client' + socket.name + ' disconnected!');
    });

    // Put this new client in the list
    module.exports.clients.push(socket);
    console.log('client ' + socket.name + ' connected!');

});

module.exports.clients = [];


module.exports.sendCommand = function(trackerID, command, newValue, callback) {

    for(var i = 0; i < module.exports.clients.length; i++) {
        var client = module.exports.clients[i];
        if(client.trackerID) {
            if(client.trackerID === trackerID) {
                client.registerCommand(command, newValue, callback);
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


