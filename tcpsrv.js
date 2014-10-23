/**
 * Created by roger.jaggi on 22.10.2014.
 */

// Load the TCP Library
var net = require('net');
var Parser = require('binary-parser').Parser;
var readline = require('readline');

var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('cmd> ');

var atDateTime = new Parser()
    .endianess('big')
    .uint8('hour') // 0-23
    .uint8('minute') // 0-59
    .uint8('second') // 0-59
    .uint8('year') // 0-99
    .uint8('month') // 1-12
    .uint8('day'); // 1 to 31


var atAsyncHearbeatMessage = new Parser()
    .endianess('big')
    .nest('rtc', { type: atDateTime }); // rtc date

var atAsyncGPSMessage = new Parser()
    .endianess('big')
    .nest('gps', { type: atDateTime }) // gps date
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
    .uint16('analogInput2') // 0.001 voltage units
    .nest('rtc', { type: atDateTime })
    .nest('posSending', { type: atDateTime });

var atAsyncStatusMessage = new Parser()
    .endianess('big')
    .uint32('modemID1') // Modem ID or IMEI Part 1
    .uint32('modemID2') // Modem ID or IMEI Part 2
    .uint16('messageID') // See Message ID Table
    .uint16('dataLength') // 16-bit data length
    .choice('data', {
        tag: 'messageID',
        choices: {
            0xAB: atAsyncHearbeatMessage
        },
        defaultChoice: atAsyncGPSMessage
    });

var atAsyncTextMessage = new Parser()
    .endianess('big')
    .uint16('dataLength') // 16-bit data length
    .string('textMessage', { length: 'dataLength '})
    .nest('rtc', { type: atDateTime })
    .nest('posSending', { type: atDateTime });


var atCommandResponse = new Parser()
    .endianess('big')
    .uint16('dataLength') // 16-bit data lenngth
    .string('messageData', { length: 'dataLength' });

var atASCIIAcknowledge = new Parser()
    .endianess('big')
    .uint16('transactionID')
    .uint16('sequenceID')
    .uint32le('modemID');

var atBinaryResponsePacket = new Parser()
    .endianess('big')
    .uint16('transactionID')
    .uint8('messageEncoding')
    .uint8('messageType')
    .choice('message', {
        tag: 'messageEncoding',
        choices: {
            0x00: atAsyncStatusMessage,
            0x01: atCommandResponse,
            0x02: atAsyncTextMessage,
            0x03: atAsyncTextMessage,
            0x04: atAsyncTextMessage
        }
    });
    /* .choice('message', {
        tag: 'messageEncodingAndType',
        choices: {
            0x0002: atAsyncStatusMessage,
            0x0100: atCommandResponse, // request
            0x0101: atCommandResponse, // response success
            0x0104: atCommandResponse, // response error
            0x0202: atAsyncTextMessage,
            0x0302: atAsyncTextMessage,
            0x0402: atAsyncTextMessage,
            0x0003: atBinaryAcknowledge
        }
    }); */

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

// Start a TCP Server
net.createServer(function (socket) {

    // Identify this client
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    //socket.isInitHandshakeDone = false;
    socket.isASCIIFormat = null;
    socket.currentCommand = null;
    socket.commandQueue = [];
    socket.lastTransactionID = 0;

    socket.sendBinaryAcknowledge = function(transactionID, success) {
        var ackBuffer = new Buffer(6);
        ackBuffer.writeUInt16BE(transactionID, 0);
        ackBuffer.writeUInt8(0x00, 2);
        ackBuffer.writeUInt8(0x03, 3);
        ackBuffer.writeUInt16BE( ( success ? 0x0000 : 0x0001 ), 4);



        socket.write(ackBuffer);
    };

    socket.sendBinaryCommand = function(commandstring) {
        var buf = new Buffer(6 + commandstring.length);
        buf.writeUInt16BE(socket.lastTransactionID + 1, 0);
        buf.writeUInt8(0x01, 2);
        buf.writeUInt8(0x00, 3);
        buf.writeUInt16BE( commandstring.length, 4);
        buf.write( commandstring, 6, commandstring.length, 'ascii');
        socket.write(buf);
    };

    // Handle incoming messages from clients.
    socket.on('data', function (data) {

        if(socket.isASCIIFormat) {
            process.stdout.write(data);

            // prompt for a new command for the tracker
            rl.prompt();
            return;
        }
        else if(data.readUInt16BE(0) == 0xfaf8) {

            var asciiAck = atASCIIAcknowledge.parse(data);

            // answer handshake
            socket.write(data);

            //socket.isInitHandshakeDone = true;
            socket.isASCIIFormat = true;
            console.log("Heartbeat no. " + asciiAck.sequenceID + " from modem id " + asciiAck.modemID + " received!");
            return;
        }
        else {
            socket.isASCIIFormat = false;
        }


        // Binary format

        //console.log(data);
        try {
            var packet = atBinaryResponsePacket.parse(data);
        }
        catch(err) {
            console.log(err);

            // binary data analysis failed, check if we use the correct format
            //socket.write('at$format?');

            return
        }

        console.log(packet);

        socket.lastTransactionID = packet.transactionID;

        // Check for async answer
        if(packet.messageType == 0x02) {
            // answer async message with acknowledge
            socket.sendBinaryAcknowledge(packet.transactionID, true);
        }

        rl.prompt();



        /*
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
        } */

        // check for async GPS Position message
        // format:



        //process.stdout.write(data);




    });

    // Remove the client from the list when it leaves
    socket.on('end', function () {
        clients.splice(clients.indexOf(socket), 1);
        console.log('client' + socket.name + ' disconnected!');
    });

    // Put this new client in the list
    clients.push(socket);
    console.log('client ' + socket.name + ' connected!');

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
