/**
 * Created by roger.jaggi on 05.11.2014.
 */
var Parser = require('binary-parser').Parser;

var atFormat = {};

atFormat.atDateTime = new Parser()
    .endianess('big')
    .uint8('hour') // 0-23
    .uint8('minute') // 0-59
    .uint8('second') // 0-59
    .uint8('year') // 0-99
    .uint8('month') // 1-12
    .uint8('day'); // 1 to 31

atFormat.atAsyncHearbeatMessage = new Parser()
    .endianess('big')
    .nest('rtc', { type: atFormat.atDateTime }); // rtc date

atFormat.atAsyncGPSMessage = new Parser()
    .endianess('big')
    .nest('gps', { type: atFormat.atDateTime }) // gps date
    .int32('latitude') // 0.00001 degree units
    .int32('longitude') // 0.00001 degree units
    .uint8('altitude1')
    .int16('altitude2')
    .uint16('speed') // 0.1 meters per second units
    .uint16('direction') // 0.1 degree units
    .uint32('odometer') // meter units - see AT$ODO command
    .uint8('hdop') // 0.1 units
    .uint8('satelliteCount') // number of satellites used
    .uint16('iostatus') // see I/O Status table
    .uint8('vehicleStatus') // see Vehicle Status Table
    .uint16('analogInput1') // 0.001 voltage units
    .uint16('analogInput2') // 0.001 voltage units
    .nest('rtc', { type: atFormat.atDateTime })
    .nest('posSending', { type: atFormat.atDateTime });

atFormat.atAsyncStatusMessage = new Parser()
    .endianess('big')
    .uint32('modemID1') // Modem ID or IMEI Part 1
    .uint32('modemID2') // Modem ID or IMEI Part 2
    .uint16('messageID') // See Message ID Table
    .uint16('dataLength') // 16-bit data length
    .choice('data', {
        tag: 'messageID',
        choices: {
            0xAB: atFormat.atAsyncHearbeatMessage
        },
        defaultChoice: atFormat.atAsyncGPSMessage
    });

atFormat.atAsyncTextMessage = new Parser()
    .endianess('big')
    .uint16('dataLength') // 16-bit data length
    .string('textMessage', { length: 'dataLength '})
    .nest('rtc', { type: atFormat.atDateTime })
    .nest('posSending', { type: atFormat.atDateTime });


atFormat.atCommandResponse = new Parser()
    .endianess('big')
    .uint16('dataLength') // 16-bit data length
    .string('messageData', { length: 'dataLength' });

atFormat.atASCIIAcknowledge = new Parser()
    .endianess('big')
    .uint16('transactionID')
    .uint16('sequenceID')
    .uint32le('modemID');

atFormat.atBinaryResponsePacket = new Parser()
    .endianess('big')
    .uint16('transactionID')
    .uint8('messageEncoding')
    .uint8('messageType')
    .choice('message', {
        tag: 'messageEncoding',
        choices: {
            0x00: atFormat.atAsyncStatusMessage,
            0x01: atFormat.atCommandResponse,
            0x02: atFormat.atAsyncTextMessage,
            0x03: atFormat.atAsyncTextMessage,
            0x04: atFormat.atAsyncTextMessage
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

atFormat.generateBinaryAcknowledge = function(transactionID, success) {
    var ackBuffer = new Buffer(6);
    ackBuffer.writeUInt16BE(transactionID, 0);
    ackBuffer.writeUInt8(0x00, 2);
    ackBuffer.writeUInt8(0x03, 3);
    ackBuffer.writeUInt16BE( ( success ? 0x0000 : 0x0001 ), 4);

    return ackBuffer;
};

atFormat.generateBinaryCommandRequest = function(transactionID, commandString) {
    var buf = new Buffer(6 + commandString.length);
    buf.writeUInt16BE(transactionID, 0);
    buf.writeUInt8(0x01, 2);
    buf.writeUInt8(0x00, 3);
    buf.writeUInt16BE(commandString.length, 4);
    buf.write(commandString, 6, commandString.length, 'ascii');

    return buf;
};

module.exports = atFormat;