/**
 * Created by Roger Jaggi on 05.11.2014.
 */
var Parser = require('binary-parser').Parser;
var S = require('string');
var Moment = require('moment');
var _ = require('underscore-node');
var events = require('events');

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

        return {
            modemIDorIMEI: GPSData[0],
            devicetime: GPSData[13],
            gpstime: GPSData[1],
            latitude: GPSData[2],
            longitude: GPSData[3],
            altitude: GPSData[6],
            speed: GPSData[4],
            direction: GPSData[5],
            satelliteCount: [7]
        };
    }

    return null;
};

atFormat.parseASCII_TXT = function(responseString) {
    var response = S(responseString);

    //$SNDTXT:< Modem_ID >,<Text data>,<RTC time>0x0d0x0a
    if(response.startsWith("$SNDTXT:")) {

        var parts = S(gpsstring.toString().substring(8)).parseCSV(',', null);

        return {
            modemIDorIMEI: parts[0],
            devicetime: parts[2],
            message: parts[1]
        };
    }

    return null;
};

atFormat.parseASCII_Garmin = function(responseString) {
    var response = S(responseString);

    //$SNDGA:<Garmin data>0x0d0x0a
    if(response.startsWith("$SNDGA:")) {
        var parts = S(gpsstring.toString().substring(7)).parseCSV(',', null);

        return {
            message: parts[0]
        };

    }

    return null;
};

atFormat.parseASCII_OBD = function(responseString) {
    var response = S(responseString);

    //$SNDOBD:<Modem_ID>,<Longitude>,<Latitude>,<OBD response>,<RTC time>0x0d0x0a
    if(response.startsWith("$SNDOBD:")) {
        var parts = S(gpsstring.toString().substring(7)).parseCSV(',', null);

        return {
            modemIDorIMEI: parts[0],
            longitude: parts[1],
            latitude: parts[2],
            devicetime: parts[4],
            obdresponse: parts[3]
        };
    }

    return null;
};

function AtCommandDefinition(arg) {

    var self = this;
    self.config = arg;

    events.EventEmitter.call(this);

    this.isCommand = function(commandname) {
        return commandname == self.config.name;
    };

    this.getName = function() {
        return self.config.name;
    };

    this.isReadOnly = function() {
        return !!self.config.readOnly;
    };

    this.getDataLines = function() {
        return self.config.dataLines;
    };

    this.getCommandString = function(rawNewValue) {
        return "AT$" + self.getName() + ( S(rawNewValue).isEmpty() ? "?" : "=" + rawNewValue ) + "\n";
    };

    this.getRawStringValue = function(objectValue) {
        return self.config.getRawStringValue !== undefined && self.config.getRawStringValue !== null ? self.config.getRawStringValue(objectValue) : objectValue.toString();
    };

    this.parseResponse = function(commandObj, rawResponseArray) {
        return self.config.parseResponse !== undefined && self.config.parseResponse !== null ? self.config.parseResponse(commandObj, rawResponseArray) : rawResponseArray.join('\n');
    };

    this.callFailureHandlers = function(tracker, command) {
        this.emit('onFailure', tracker, command);
    };

    this.callSuccessHandlers = function(tracker, command) {
        this.emit('onSuccess', tracker, command);
    };
}
AtCommandDefinition.prototype.__proto__ = events.EventEmitter.prototype;

/*
var frontDoor = new AtCommandDefinition('brown');

frontDoor.on('open', function() {
    console.log('ring ring ring');
});
frontDoor.open();
*/

atFormat.CommandList = [];

// Type Zero = zero data line, only command response line
atFormat.CommandList.push(new AtCommandDefinition({ name: "REBOOT", dataLines: 0, readOnly: true, description: "reboot device" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "RESET", dataLines: 0, readOnly: true, description: "reset device to factory default" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "MSGQCL", dataLines: 0, readOnly: false, description: "Clear message queue" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SAVE", dataLines: 0, readOnly: true, description: "Save settings to permanent storage. Without save all changes will be lost at next reboot!" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "WIRETAP", dataLines: 0, readOnly: false, description: "Establish a voice wiretap connection from device to a specific phone number." }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "CALL", dataLines: 0, readOnly: false, description: "Make a call out" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "ANSWER", dataLines: 0, readOnly: true, description: "Answer an incoming call" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "HANGUP", dataLines: 0, readOnly: true, description: "Hangup a call" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SNDTXT", dataLines: 0, readOnly: false, description: "Send text message from device to server" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SPSNDTXT", dataLines: 0, readOnly: false, description: "Send text message to specified serial port" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "CODE", dataLines: 0, readOnly: false, description: "Send barcode reader data" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SNDGA", dataLines: 0, readOnly: false, description: "Send text message for Garmin GPRS" }));

// Commands with one Data line for question, only command response line on error or for set
atFormat.CommandList.push(new AtCommandDefinition({ name: "MODID", dataLines: 1, readOnly: false, description: "Get/sets the module id"}));

// NetModule specific commands
atFormat.CommandList.push(new AtCommandDefinition({ name: "RELAY", dataLines: 1, readOnly: false, description: "NetModule: Switches the relay" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "WANSTATUS", dataLines: 1, readOnly: false, description: "NetModule: get wan status",
    parseResponse: function(commandObj, rawResponseData) {

        console.log("WAN Status: ", rawResponseData);

        if(rawResponseData.length == 0) {
            return {};
        }

        var parts = S(rawResponseData[0]).replaceAll('n/a','').split(",");

        if(parts.length != 19) {
            console.log("Invalid WANStatus-String (not 19 elements)", parts);
            return {};
        }
        //$WANSTATUS=time, WANLINK1_GATEWAY, WANLINK1_STATE, WANLINK1_STATE_UP_SINCE, WANLINK1_DIAL_ATTEMPTS, WANLINK1_DATA_UPLOADED, WANLINK1_DIAL_SUCCESS, WANLINK1_ADDRESS, WANLINK1_DOWNLOAD_RATE, WANLINK1_SERVICE_TYPE, WANLINK1_UPLOAD_RATE, WANLINK1_TYPE,
        // WANLINK1_DIAL_FAILURES, WANLINK1_REGISTRATION_STATE, WANLINK1_SIM, WANLINK1_INTERFACE, WANLINK1_DATA_DOWNLOADED, WAN_HOTLINK, WANLINK1_SIGNAL_STRENGTH
        return {    deviceTime: Moment(S(parts[0]).toInteger() * 1000).toDate(),
                    WANLINK1_GATEWAY: parts[1],
                    WANLINK1_STATE: parts[2],
                    WANLINK1_STATE_UP_SINCE: parts[3],
                    WANLINK1_DIAL_ATTEMPTS: S(parts[4]).toInteger(),
                    WANLINK1_DATA_UPLOADED: S(parts[5]).toInteger(),
                    WANLINK1_DIAL_SUCCESS: S(parts[6]).toInteger(),
                    WANLINK1_ADDRESS: parts[7],
                    WANLINK1_DOWNLOAD_RATE: S(parts[8]).toInteger(),
                    WANLINK1_SERVICE_TYPE: parts[9],
                    WANLINK1_UPLOAD_RATE: S(parts[10]).toInteger(),
                    WANLINK1_TYPE: parts[11],
                    WANLINK1_DIAL_FAILURES: S(parts[12]).toInteger(),
                    WANLINK1_REGISTRATION_STATE: parts[13],
                    WANLINK1_SIM: parts[14],
                    WANLINK1_INTERFACE: parts[15],
                    WANLINK1_DATA_DOWNLOADED: S(parts[16]).toInteger(),
                    WAN_HOTLINK: parts[17],
                    WANLINK1_SIGNAL_STRENGTH: S(parts[18]).toInteger()
             };
    } }));

atFormat.CommandList.push(new AtCommandDefinition({ name: "GPSSTATUS", dataLines: 1, readOnly: false, description: "NetModule: get gps status",
    parseResponse: function(commandObj, rawResponseData) {

        console.log("GPS Status: ", rawResponseData);

        if(rawResponseData.length == 0) {
            return {};
        }

        var parts = S(rawResponseData[0]).replaceAll('n/a','').split(",");
        if(parts.length != 13) {
            console.log("Invalid GPSStatus-String (not 13 elements)", parts);
            return {};
        }

        //$GPSSTATUS=time,gpsSystem,moduleType,longitude,latitude,altitude,hdop,vdop,pdop,satellitesUsed,satellitesInView,verticalSpeed,horizontalSpeed
        return {
            deviceTime: Moment(S(parts[0]).toInteger() * 1000).toDate(),
            gpsSystem: parts[1],
            moduleType: parts[2],
            longitude: parts[3],
            latitude: parts[4],
            altitude: parts[5],
            hdop: parts[6],
            vdop: parts[7],
            pdop: parts[8],
            satellitesUsed: S(parts[9]).toInteger(),
            satellitesInView: S(parts[10]).toInteger(),
            verticalSpeed: parts[11],
            horizontalSpeed: parts[12]
        };
    } }));

atFormat.CommandList.push(new AtCommandDefinition({ name: "PIN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "PINEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "APN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SMSDST", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SMSLST", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "LSTLIMIT", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SMSCFG", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GPRSEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IPTYPE", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "BAND", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "POLC", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GSMJDC", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "FORMAT", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "HB", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "RETRY", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "NETCFG", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "PACKAGE", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "BAUD", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "FILTER", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "ODO", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "URL", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GPSPT", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "PKEY", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "OKEY", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "DNS", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "MSGQ", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "VEXT", dataLines: 1, readOnly: true, description: "Get external voltage in mV" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "VBAT", dataLines: 1, readOnly: true, description: "Get battery voltage in mV" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "VERSION", dataLines: 1, readOnly: true, description: "Get firmware version and device info" ,
                                                parseResponse: function(commandObj, rawResponseData) {

                                                    if(rawResponseData.length == 0) return null;

                                                    var parts = rawResponseData[0].split(",");
                                                    //$VERSION=<FW Version>,<HW Version>,<GSM Version> }
                                                    return { firmwareVersion: parts[0], hardwareVersion: parts[1], gsmVersion: parts[2], deviceType: parts[3] };
                                                } }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "QUST", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IMEI", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IP", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SMID", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SIMID", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "PWRM", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "MIC", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SPK", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SPKMUTE", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "VOICE", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "ICL", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "OGL", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "RFIDC", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IDRM", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IBDETEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "TAG", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "FUEL", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SNDOBD", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "OBDEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "OBDRPT", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "OBDGDTC", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GAFUN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GADETEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GETPDS", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "PDSR", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "LPRC", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IN1", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IN1EN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IGN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "IGNEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "EGN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "EGNEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SPEED", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SPEEDEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GF", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GFEN", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "POWER", dataLines: 1, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "GPSMON", dataLines: 1, readOnly: false, description: "ToDo" }));

// Type List = Ten Lines for questions, only command response line on error or for set
atFormat.CommandList.push(new AtCommandDefinition({ name: "HOSTS", dataLines: 10, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "POL", dataLines: 10, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "SCHED", dataLines: 10, readOnly: false, description: "ToDo" }));
atFormat.CommandList.push(new AtCommandDefinition({ name: "RFLC", dataLines: 10, readOnly: false, description: "ToDo" }));

atFormat.ATCommandReturnCode = {
    AWAIT_MORE_DATA: 2,
    SUCCESSFULLY_FINISHED: 1,
    UNKNOWN_DATA:   0,
    WRONG_COMMAND: -1
};

atFormat.DeviceTypes = {
    CAREU1_TRACKER: 1,
    NETMODULE: 2
};

atFormat.AtCommand = function(command, newValue, callback) {

    var self = this;
    self.command = null;
    self.newValue = null;
    self.sentTime = null;
    self.finishedTime = null;

    self.rawNewValue = null;
    self.rawResponseData = [];
    self.outstandingLineCount = 0;

    self.result = false;
    self.responseData = null;
    self.errortext = "";
    self.callback = callback;
    self.sentTimer = null;

    // validate command
    var i, found = false;

    command = command.toString().toUpperCase();

    for(i = 0; i < atFormat.CommandList.length && !found; i++) {
        if(atFormat.CommandList[i].isCommand(command)) {
            self.command = atFormat.CommandList[i];
            found = true;
        }
    }

    if(!found) {
        self.errortext = "Unknown command";
        self.command = null;
    }
    else {
        self.outstandingLineCount = self.command.getDataLines() + 1;

        if (newValue !== undefined && newValue !== null) {

            self.newValue = newValue;

            if (_.isObject(newValue)) {

                self.rawNewValue = self.command.getRawStringValue(newValue);

                if (!self.rawNewValue) {
                    self.errortext = "Invalid value for command " + self.command;
                    self.command = null;
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

        if(self.newValue != null && self.command.isReadOnly()) {
            self.errortext = "Command " + self.command.config.name + " is a read only command. No new value can be set.";
            self.command = null;
        }
    }

    this.isValid = function() {
        return self.command != null;
    };

    this.isReadCommand = function() {
        return self.newValue == null;
    };

    this.getCommandString = function() {
        return this.isValid() ? self.command.getCommandString(self.rawNewValue) : '';
    };

    this.setStatusSent = function(timerObject) {
        self.sentTime = Moment();
        self.sendTimer = timerObject;
    };

    this.finishAndCallCallback = function(tracker, errorText) {
        // clear Timer and set finishedTime
        if(self.sendTimer) clearTimeout(self.sendTimer);
        self.finishedTime = Moment();
        var difference = self.sentTime ? self.finishedTime.diff(self.sentTime) : null;

        if(!S(errorText).isEmpty()) self.errortext = errorText;

        if(self.callback) {
            if (self.result) {

                self.result = true; // ensure boolean not null value
                self.responseData = self.command.parseResponse(self, self.rawResponseData);

                self.command.callSuccessHandlers(tracker, self);
                self.callback(null, tracker, self.responseData, difference);
            }
            else {
                self.result = false; // ensure boolean not null value

                if(S(self.errortext).isEmpty()) self.errortext = "Unknown Error happened for command " + self.command;

                self.command.callFailureHandlers(tracker, self);
                self.callback(new Error(self.errortext), tracker, null, difference);
            }
        }
    };

    // return true if one more line is expected, otherwise false
    this.parseLine = function(line)
    {
        var dataLine;
        dataLine = line.toString().match(/^(\$|OK:|ERROR:)([\w\d]+)=?(.*)/i);

        if(!dataLine) {
            console.log("Unknown command data: ", dataLine);
            return atFormat.ATCommandReturnCode.UNKNOWN_DATA;
        }

        dataLine[1] = dataLine[1].toUpperCase();
        dataLine[2] = dataLine[2].toUpperCase();

        if(!self.command.isCommand(dataLine[2])) {
            return atFormat.ATCommandReturnCode.WRONG_COMMAND;
        }

        if(dataLine[1] === "OK:" || dataLine[1] === "ERROR:") {
            // we got a header
            self.result = dataLine[1] === "OK:";
            if(!self.result) self.errortext = "Device returned " + dataLine[1];
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