/**
 * Created by roger.jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var Parser = require('binary-parser').Parser;
var readline = require('readline');

var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('send to trackers> ');

var atDateTime = new Parser()
    .endianess('big')
    .uint8('hour') // 0-23
    .uint8('minute') // 0-59
    .uint8('second') // 0-59
    .uint8('year') // 0-99
    .uint8('month') // 1-12
    .uint8('day'); // 1 to 31

var atAsyncGPSMessage = new Parser()
    .endianess('big')
    .uint32('modemID1') // Modem ID or IMEI Part 1
    .uint32('modemID2') // Modem ID or IMEI Part 2
    .uint16('messageID') // See Message ID Table
    .uint16('dataLength') // 16-bit data length
    .nest('gps', atDateTime) // gps date
    .int32('latitude') // 0.00001 degree units
    .int32('longitude') // 0.00001 degree units
    .uint16('speed') // 0.1 meters per second units
    .uint16('direction') // 0.1 degree units
    .uint32('odometer') // meter units - see AT$ODO command
    .uint8('hdop') // 0.1 units
    .uint8('satelliteCount') // number of satellites used
    .uint16('iostatus') // see I/O Status table
    .uint8('vehicleStatus') // see Vehicle Status Table
    .uint16('analogInput1') // 0.001 voltage units
    .unit16('analogInput2') // 0.001 voltage units
    .nest('rtc', atDateTime)
    .nest('posSending', atDateTime);

var atAsyncTextMessage = new Parser()
    .endianess('big')
    .uint16('dataLength') // 16-bit data length
    .string('textMessage', { length: 'dataLength '})
    .nest('rtc', atDateTime)
    .nest('posSending', atDateTime);


var atCommandResponse = new Parser()
    .endianess('big')
    .uint16('dataLength') // 16-bit data lenngth
    .string('messageData', { length: 'dataLength' });

var atASCIIAcknowledge = new Parser()
    .endianess('big')
    .uint16('sequenceID')
    .uint32le('modemID');

var atBinaryAcknowledge = new Parser()
    .endianess('big')
    .uint16('statusCode');

var atBinaryResponsePacket = new Parser
    .endianess('big')
    .uint8('messageEncoding')
    .uint8('messageType')
    .choice('type', {
        tag: 'messageType',
        choices: {
            0x00: atAsyncGPSMessage,
            0x01: atCommandResponse, //response success
            0x02: atAsyncTextMessage,
            0x03: atBinaryAcknowledge,
            0x04: atCommandResponse // response error
        }
    });

var atPacket = new Parser()
    .endianess('big')
    .uint16('transactionID')
    .choice('format', {
        tag: 'transactionID',
        choices: {
            0xfaf8: atASCIIAcknowledge
        },
        defaultChoice: atBinaryResponsePacket
    });

// Keep track of the chat clients
var clients = [];

var commandObject = function(command, newValue, callback) {
    this.command = command;
    this.newValue = newValue;
    this.callback = callback;
};

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
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    socket.isTrackerHandshakeDone = false;
    socket.currentCommand = null;
    socket.commandQueue = [];

    // Put this new client in the list
    clients.push(socket);
    console.log('client ' + socket.name + ' connected!');

    // Handle incoming messages from clients.
    socket.on('data', function (data) {

        var packet = atPacket(data);

        console.log(data);
        console.log(packet);

        if( data.length == 8 ) { // acknowledge message
            ackPacket = atFormatASCIIAcknowledge.parse(data);
            //console.log(data);
            if( ackPacket.header1 == 250 && ackPacket.header2 == 248) { // check for ASCII Header detection
                // answer heartbeat
                socket.write(data);
                socket.isTrackerHandshakeDone = true;
                console.log("Heartbeat no. " + ackPacket.sequenceID + " from modem id " + ackPacket.modemID + " received!");
                return;
            }
        }

        // check for async GPS Position message
        // format:



        process.stdout.write(data);



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
