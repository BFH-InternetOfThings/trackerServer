/**
 * Created by Roger Jaggi on 05.11.2014.
 */
var Parser = require('binary-parser').Parser;
var S = require('string');
var Moment = require('moment');
var _ = require('underscore-node');

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
    .uint8('altitude2')
    .uint8('altitude3')
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
    return Moment.utc(dataObject);
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

atFormat.CommandList = [];

// Type Zero = zero data line, only command response line
atFormat.CommandList.push({ name: "REBOOT", dataLines: 0, readOnly: true, description: "reboot device" });
atFormat.CommandList.push({ name: "RESET", dataLines: 0, readOnly: true, description: "reset device to factory default" });
atFormat.CommandList.push({ name: "MSGQCL", dataLines: 0, readOnly: false, description: "Clear message queue" });
atFormat.CommandList.push({ name: "SAVE", dataLines: 0, readOnly: true, description: "Save settings to permanent storage. Without save all changes will be lost at next reboot!" });
atFormat.CommandList.push({ name: "WIRETAP", dataLines: 0, readOnly: false, description: "Establish a voice wiretap connection from device to a specific phone number." });
atFormat.CommandList.push({ name: "CALL", dataLines: 0, readOnly: false, description: "Make a call out" });
atFormat.CommandList.push({ name: "ANSWER", dataLines: 0, readOnly: true, description: "Answer an incoming call" });
atFormat.CommandList.push({ name: "HANGUP", dataLines: 0, readOnly: true, description: "Hangup a call" });
atFormat.CommandList.push({ name: "SNDTXT", dataLines: 0, readOnly: false, description: "Send text message from device to server" });
atFormat.CommandList.push({ name: "SPSNDTXT", dataLines: 0, readOnly: false, description: "Send text message to specified serial port" });
atFormat.CommandList.push({ name: "CODE", dataLines: 0, readOnly: false, description: "Send barcode reader data" });
atFormat.CommandList.push({ name: "SNDGA", dataLines: 0, readOnly: false, description: "Send text message for Garmin GPRS" });

// Commands with one Data line for question, only command response line on error or for set
atFormat.CommandList.push({ name: "MODID", dataLines: 1, readOnly: false, description: "Get/sets the module id",
                                                successHandler: function(tracker, commandObj) {
                                                    if(!commandObj.isReadCommand() && !S(commandObj.newValue).isEmpty()) {
                                                        tracker._setTrackerID(commandObj.newValue)
                                                    }
                                                }});
/* atFormat.CommandList.push({ name: "MODID", dataLines: 1, readOnly: false, description: "Get/sets the module id",
    parseResponse: function(rawResponseData) {
        return { moduleID: rawResponseData[0] };
    },
    getRawStringValue: function(newValueObject) {
        return newValueObject.modid;
    },

}); */
atFormat.CommandList.push({ name: "PIN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "PINEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "APN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SMSDST", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SMSLST", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "LSTLIMIT", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SMSCFG", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GPRSEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IPTYPE", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "BAND", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "POLC", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GSMJDC", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "FORMAT", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "HB", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "RETRY", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "NETCFG", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "PACKAGE", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "BAUD", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "FILTER", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "ODO", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "URL", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GPSPT", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "PKEY", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "OKEY", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "DNS", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "MSGQ", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "VEXT", dataLines: 1, readOnly: true, description: "Get external voltage in mV" });
atFormat.CommandList.push({ name: "VBAT", dataLines: 1, readOnly: true, description: "Get battery voltage in mV" });
atFormat.CommandList.push({ name: "VERSION", dataLines: 1, readOnly: true, description: "Get firmware version and device info" ,
                                                parseResponse: function(rawResponseData) {
                                                    var parts = rawResponseData[0].split(",");
                                                    //$VERSION=<FW Version>,<HW Version>,<GSM Version> }
                                                    return { firmwareVersion: parts[0], hardwareVersion: parts[1], gsmVersion: parts[2], deviceType: parts[3] };
                                                } });
atFormat.CommandList.push({ name: "QUST", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IMEI", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IP", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SMID", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SIMID", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "PWRM", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "MIC", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SPK", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SPKMUTE", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "VOICE", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "ICL", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "OGL", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "RFIDC", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IDRM", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IBDETEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "TAG", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "FUEL", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SNDOBD", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "OBDEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "OBDRPT", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "OBDGDTC", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GAFUN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GADETEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GETPDS", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "PDSR", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "LPRC", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IN1", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IN1EN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IGN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "IGNEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "EGN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "EGNEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SPEED", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SPEEDEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GF", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GFEN", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "POWER", dataLines: 1, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "GPSMON", dataLines: 1, readOnly: false, description: "ToDo" });

// Type List = Ten Lines for questions, only command response line on error or for set
atFormat.CommandList.push({ name: "HOSTS", dataLines: 10, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "POL", dataLines: 10, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "SCHED", dataLines: 10, readOnly: false, description: "ToDo" });
atFormat.CommandList.push({ name: "RFLC", dataLines: 10, readOnly: false, description: "ToDo" });

atFormat.ATCommandReturnCode = {
    AWAIT_MORE_DATA: 2,
    SUCCESSFULLY_FINISHED: 1,
    UNKNOWN_DATA:   0,
    WRONG_COMMAND: -1
};

atFormat.AtCommand = function(command, newValue, callback) {

    var self = this;
    self.command = !S(command).isEmpty() ? command.toString().toUpperCase() : "";
    self.newValue = null;
    self.sentTime = null;
    self.finishedTime = null;

    self.rawNewValue = null;
    self.rawResponseData = [];

    self.outstandingLineCount = 0;
    self.commandDefiniton = null;

    self.result = false;
    self.responseData = null;
    self.errortext = "";
    self.callback = callback;
    self.sentTimer = null;

    // validate command
    var i, found = false;

    for(i = 0; i < atFormat.CommandList.length && !found; i++) {
        if(atFormat.CommandList[i].name === self.command) {
            self.commandDefiniton = atFormat.CommandList[i];
            found = true;
        }
    }

    if(!found) {
        self.errortext = "Unknown command";
        self.command = "";
    }
    else {
        self.outstandingLineCount = self.commandDefiniton.dataLines + 1;

        if (newValue !== undefined && newValue !== null) {

            self.newValue = newValue;

            if (_.isObject(newValue)) {

                self.rawNewValue = self.commandDefiniton.getRawStringValue !== undefined && self.commandDefiniton.getRawStringValue !== null ? self.commandDefiniton.getRawStringValue(newValue) : newValue.toString();

                if (!self.rawNewValue) {
                    self.errortext = "Invalid value for command " + self.command;
                    self.command = "";
                }
            }
            else {
                self.rawNewValue = newValue.toString();

                if (S(self.rawNewValue).isEmpty()) {
                    self.rawNewValue = null;
                    self.newValue = null;
                }
            }
        }

        if(self.newValue != null && self.commandDefiniton.readOnly === true) {
            self.errortext = "Command " + self.command + " is a read only command. No new value can be set.";
            self.command = "";
        }
    }

    this.isValid = function() {
        return !S(self.command).isEmpty();
    };

    this.isReadCommand = function() {
        return self.newValue == null;
    };

    this.getCommandString = function() {
        var commandString = '';

        if (this.isValid()) {
            if (this.isReadCommand()) {
                commandString = "AT$" + self.command + "?\n";
            }
            else {
                commandString = "AT$" + self.command + "=" + self.rawNewValue + "\n";
            }
        }

        return commandString;
    };

    this.setStatusSent = function(timerObject) {
        self.sentTime = Moment();
        self.sendTimer = timerObject;
    };

    this.finishAndCallCallback = function(tracker, errortext) {
        // clear Timer and set finishedTime
        if(self.sendTimer) clearTimeout(self.sendTimer);
        self.finishedTime = Moment();
        var difference = self.sentTime ? self.finishedTime.diff(self.sentTime) : null;

        if(!S(errortext).isEmpty()) self.errortext = errortext;

        if(self.callback) {
            if (self.result) {

                self.result = true; // ensure boolean not null value
                if(!this.isReadCommand()) {
                    self.responseData = null;
                }
                else {
                    self.responseData = self.commandDefiniton.parseResponse !== undefined && self.commandDefiniton.parseResponse !== null ? self.commandDefiniton.parseResponse(self.rawResponseData) : self.rawResponseData.join('\n');
                }

                if(self.commandDefiniton.successHandler !== undefined && self.commandDefiniton.successHandler !== null) {
                    self.commandDefiniton.successHandler(tracker, self);
                }

                self.callback(null, tracker, self.responseData, difference);
            }
            else {
                self.result = false; // ensure boolean not null value

                if(S(self.errortext).isEmpty()) self.errortext = "Unknown Error happened for command " + self.command;

                self.callback(new Error(self.errortext), tracker, null, difference);
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
            if(!self.result) self.errortext = "Tracker returned ERROR";
        }
        else {
            // we got a data line
            self.rawResponseData.push(dataLine[3]);
        }

        self.outstandingLineCount -= 1;
        return self.outstandingLineCount > 0 ? atFormat.ATCommandReturnCode.AWAIT_MORE_DATA : atFormat.ATCommandReturnCode.SUCCESSFULLY_FINISHED;
    };
};

module.exports = atFormat;