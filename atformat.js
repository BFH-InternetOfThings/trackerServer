/**
 * Created by Roger Jaggi on 05.11.2014.
 */
var Parser = require('binary-parser').Parser;
var S = require('string');
var moment = require('moment');

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
    .uint16('transactionID', {
        assert: function(x) {
            return x >= 0;
        }})
    .uint8('messageEncoding', {
        assert: function(x) {
            return x >= 0 || x < 5;
        }})
    .uint8('messageType', {
        assert: function(x) {
            return x >= 0 || x < 5;
        }})
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

atFormat.getMomentFromBinaryObject = function(dataObject) {
    dataObject.month -= 1;
    dataObject.millisecond = 0;
    return moment.utc(dataObject);
};

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


atFormat.parseASCII_GPS = function(gpsstring) {
    //<Modem_ID>,<GPS_DateTime>,<Longitude>,<Latitude>,<Speed>,<Direction>,<Altitude>,<Satellites>,<Message ID>,<Input Status>,<Output Status>,<Analog Input1>,<Analog Input2>,<RTC_DateTime>,<Mileage>

    var GPSData = S(gpsstring).parseCSV(',', null);

    if(GPSData.length == 15) {

        //TODO: Code it

        return true;
    }

    return null;
};

atFormat.parseASCII_TXT = function(responseString) {
    var response = S(responseString);

    //$SNDTXT:< Modem_ID >,<Text data>,<RTC time>0x0d0x0a
    if(response.startsWith("$SNDTXT:")) {
        //TODO: Code it

        return true;
    }

    return null;
};

atFormat.parseASCII_Garmin = function(responseString) {
    var response = S(responseString);

    //$SNDGA:<Garmin data>0x0d0x0a
    if(response.startsWith("$SNDGA:")) {
        //TODO: Code it

        return true;
    }

    return null;
};

atFormat.parseASCII_OBD = function(responseString) {
    var response = S(responseString);

    //$SNDOBD:<Modem_ID>,<Longitude>,<Latitude>,<OBD response>,<RTC time>0x0d0x0a
    if(response.startsWith("$SNDOBD:")) {
        //TODO: Code it

        return true;
    }

    return null;
};


// Type Zero = zero data line, only command response line
atFormat.typeWriteOnlyCommands = ["PINEN", "REBOOT", "RESET", "MSGQCL","SAVE","WIRETAP","CALL","ANSWER","HANGUP","SNDTXT","SPSNDTXT", "CODE","SNDGA" ];

// Type One = One Data line for question, only command response line on error or for set
atFormat.typeOneCommands = ["MODID","PIN","APN","SMSDST","SMSLST","LSTLIMIT","SMSCFG","GPRSEN","IPTYPE", "BAND","POLC","GSMJDC","FORMAT","HB","RETRY","NETCFG", "PACKAGE", "BAUD","FILTER","ODO","URL","GPSPT","PKEY","OKEY","DNS","MSGQ", "VEXT", "VBAT", "VERSION", "QUST","IMEI","IP","SMID","SIMID","PWRM","MIC","SPK","SPKMUTE","VOICE","ICL","OGL","RFIDC","IDRM","IBDETEN","TAG","FUEL","SNDOBD", "OBDEN", "OBDRPT","OBDGDTC","GAFUN","GADETEN","GETPDS","PDSR","LPRC","IN1","IN1EN","IGN","IGNEN","EGN","EGNEN","SPEED", "SPEEDEN","GF", "GFEN", "POWER", "GPSMON"  ];

// Type List = Ten Lines for questions, only command response line on error or for set
atFormat.typeTenLineCommands = ["HOSTS","POL","SCHED","RFLC"];

atFormat.ATCommandReturnCode = {
    AWAIT_MORE_DATA: 2,
    SUCCESSFULLY_FINISHED: 1,
    UNKNOWN_DATA:   0,
    WRONG_COMMAND: -1
};

atFormat.AtCommand = function(command, newValue, callback) {

    var self = this;
    self.command = !S(command).isEmpty() ? command.toString().toUpperCase() : "";
    self.newValue = !S(newValue).isEmpty() ? newValue.toString() : "";
    self.sentTime = null;
    self.responseData = [];
    self.outstandingLineCount = 0;
    self.result = false;
    self.callback = callback;

    // validate command
    var i, found = false;
    for(i = 0; i < atFormat.typeWriteOnlyCommands.length && !found; i++) {
        if(atFormat.typeWriteOnlyCommands[i] === self.command) {
            self.outstandingLineCount = 1;
            found = true;
        }
    }

    for(i = 0; i < atFormat.typeOneCommands.length && !found; i++) {
        if(atFormat.typeOneCommands[i] === self.command) {
            self.outstandingLineCount = 2;
            found = true;
        }
    }

    for(i = 0; i < atFormat.typeTenLineCommands.length && !found; i++) {
        if(atFormat.typeTenLineCommands[i] === self.command) {
            self.outstandingLineCount = 11;
            found = true;
        }
    }

    if(!found) {
        command = "";
    }

    this.getCommandString = function() {
        var commandString = '';

        if (self.command && self.command != '') {
            if (S(self.newValue).isEmpty()) {
                commandString = "AT$" + self.command + "?\n";
            }
            else {
                commandString = "AT$" + self.command + "=" + self.newValue + "\n";
            }
        }

        return commandString;
    };

    this.setStatusSent = function() {
        this.sentTime = true;
    };

    this.callCallback = function(tracker) {
        if(self.callback) {
            if (self.result) {
                self.callback(null, tracker, self.responseData);
            }
            else {
                self.callback(new Error("Tracker returned error for command " + self.command), tracker, self.responseData);
            }
        }
    };

    // return true if one more line is expected, otherwise false
    this.parseLine = function(line)
    {
        var dataLine = line.toString().match(/^(\$|OK:|ERROR:)([\w\d]+)=?(.*)/i);

        if(!dataLine) {
            console.log("Unknown command data: ", dataLine);
            return atFormat.ATCommandReturnCode.UNKNOWN_DATA;
        }

        dataLine[1] = dataLine[1].toUpperCase();
        dataLine[2] = dataLine[2].toUpperCase();

        if(dataLine[2] !== self.command) {
            return atFormat.ATCommandReturnCode.WRONG_COMMAND;
        }

        if(dataLine[1] === "OK:" || dataLine[1] === "ERROR:") {
            // we got an header
            self.result = dataLine[1] === "OK:";
        }
        else {
            // we got a data line
            self.responseData.push(dataLine[3]);
        }

        self.outstandingLineCount -= 1;
        return self.outstandingLineCount > 0 ? atFormat.ATCommandReturnCode.AWAIT_MORE_DATA : atFormat.ATCommandReturnCode.SUCCESSFULLY_FINISHED;
    };
};

module.exports = atFormat;