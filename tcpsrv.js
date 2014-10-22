/**
 * Created by roger.jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var Parser = require('binary-parser').Parser;
var readline = require('readline');

var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('send to trackers> ');

var atFormatASCIIAcknowledge = new Parser()
    .endianess('big')
    .uint8('header1')
    .uint8('header2')
    .uint16('sequenceID')
    .uint32le('modemID');

// Keep track of the chat clients
var clients = [];

// Send a message to all clients
function broadcast(message) {
    clients.forEach(function (client) {
        // only send if inital Handshake is done, otherwise the tracker won't answer the query
        if (client.isTrackerHandshakeDone == true) {
            client.write(message);
        }
    });
}

// Start a TCP Server
net.createServer(function (socket) {

    // Identify this client
    socket.name = socket.remoteAddress + ":" + socket.remotePort
    socket.isTrackerHandshakeDone = false;
    socket.isASCIIMode = false;

    // Put this new client in the list
    clients.push(socket);
    console.log('client ' + socket.name + ' connected!');

    // Handle incoming messages from clients.
    socket.on('data', function (data) {

        if( data.length == 8 ) { // acknowledge message
            ackPacket = atFormatASCIIAcknowledge.parse(data)
            //console.log(data);
            if( ackPacket.header1 == 250 && ackPacket.header2 == 248) { // check for ASCII Header detection
                // answer heartbeat
                socket.write(data);
                socket.isTrackerHandshakeDone = true;
                socket.isASCIIMode = true;
                console.log("Heartbeat no. " + ackPacket.sequenceID + " from modem id " + ackPacket.modemID + " received!");
            }
            else {
                socket.write(data);
                socket.isTrackerHandshakeDone = true;
                socket.isASCIIMode = false;
            }
        }
        else {
            process.stdout.write(data);
        }

        // prompt for a new command for the tracker
        rl.prompt();
    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        clients.splice(clients.indexOf(socket), 1);
        console.log('client' + socket.name + ' disconnected!');
    });


}).listen(9090);

// Put a friendly message on the terminal of the server.
console.log("Tissan Tracker server running at port 9090\n");


rl.on('line', function(line) {
    if (line === "exit") {
        rl.close();
    }
    broadcast(line);

}).on('close',function(){
    clients.forEach(function (client) {
        client.end(); // close socket
    });

    process.exit(0);
});
