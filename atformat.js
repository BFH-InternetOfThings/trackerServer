/**
 * Created by roger.jaggi on 05.11.2014.
 */
var Parser = require('binary-parser').Parser;
var S = require('string');

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

atFormat.getDateFromBinaryObject = function(dataObject) {
    return new Date(dataObject.year, dataObject.month, dataObject.day, dataObject.hour, dataObject.minute, dataObject.second, 0);
};

// Type Zero = zero data line, only command response line
atFormat.typeWriteOnlyCommands = ["PINEN", "REBOOT", "RESET", "MSGQCL","SAVE","WIRETAP","CALL","ANSWER","HANGUP","SNDTXT","SPSNDTXT", "CODE","SNDGA", ];

// Type One = One Data line for question, only command response line on error or for set
atFormat.typeOneCommands = ["MODID","PIN","APN","SMSDST","SMSLST","LSTLIMIT","SMSCFG","GPRSEN","IPTYPE", "BAND","POLC","GSMJDC","FORMAT","HB","RETRY","NETCFG", "PACKAGE", "BAUD","FILTER","ODO","URL","GPSPT","PKEY","OKEY","DNS","MSGQ", "VEXT", "VBAT", "VERSION", "QUST","IMEI","IP","SMID","SIMID","PWRM","MIC","SPK","SPKMUTE","VOICE","ICL","OGL","RFIDC","IDRM","IBDETEN","TAG","FUEL","SNDOBD", "OBDEN", "OBDRPT","OBDGDTC","GAFUN","GADETEN","GETPDS","PDSR","LPRC","IN1","IN1EN","IGN","IGNEN","EGN","EGNEN","SPEED", "SPEEDEN","GF", "GFEN", "POWER", "GPSMON",  ];

// Type List = Multiple Line for questions, only command response line on error or for set
atFormat.typeListCommands = ["HOSTS","POL","SCHED","RFLC"];


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

atFormat.getASCIICommandResponse = function(responseString) {
    var response = S(responseString);

    if(response.startsWith("OK:")) {
        return response.substring(3);

    }

    if(response.startsWith('ERROR:')) {
        return response.substring(6)
    }

    return null;
};

atFormat.parseASCII_GPS = function(gpsstring) {
    //<Modem_ID>,<GPS_DateTime>,<Longitude>,<Latitude>,<Speed>,<Direction>,<Altitude>,<Satellites>,<Message ID>,<Input Status>,<Output Status>,<Analog Input1>,<Analog Input2>,<RTC_DateTime>,<Mileage>

    var GPSData = S(gpsstring).parseCSV(',', null);

    if(GPSData.length == 15) {



        return true;
    }

    return null;
};

atFormat.parseASCII_TXT = function(responseString) {
    var response = S(responseString);

    //$SNDTXT:< Modem_ID >,<Text data>,<RTC time>0x0d0x0a
    if(response.startsWith("$SNDTXT:")) {


        return true;
    }

    return null;
};

atFormat.parseASCII_Garmin = function(responseString) {
    var response = S(responseString);

    //$SNDGA:<Garmin data>0x0d0x0a
    if(response.startsWith("$SNDGA:")) {


        return true;
    }

    return null;
};

atFormat.parseASCII_OBD = function(responseString) {
    var response = S(responseString);

    //$SNDOBD:<Modem_ID>,<Longitude>,<Latitude>,<OBD response>,<RTC time>0x0d0x0a
    if(response.startsWith("$SNDOBD:")) {


        return true;
    }

    return null;
};

atFormat.parseAsyncASCII = function(dataString) {

};

atFormat.AtCommand = function(command, newValue, callback) {

    this.command = command;
    this.sentTime = null;
    this.responseCommand = '';
    this.responseData = '';
    this.outstandingLineCount = 0;
    this.result = false;
    this.response = null;
    this.callback = callback;

    this.getCommandString = function() {
        if (command && command != '') {
            if (newValue == undefined || newValue == null || newValue == '') {
                this.commandString = "AT$" + command + "?\n";
            }
            else {
                this.commandString = "AT$" + command + "=" + newValue + "\n";
            }
        }
    };

    this.setStatusSent = function() {
        this.sentTime = true;
    };

    this.callCallback = function() {
        this.outstandingLineCount = 0;
        if(this.result) {
            this.callback(null, this.response);
        }
        else {
            this.callback(new Error("Tracker returned error for command" + this.command));
        }
    };

    // return true if one more line is expected, otherwise false
    this.parseCommandHeader = function(headerString)
    {

        return this.outstandingLineCount == 0;
    };

    // return true if one more line is expected, otherwise false
    this.parseCommandData = function(dataString) {

        return this.outstandingLineCount == 0;
    };
}

module.exports = atFormat;