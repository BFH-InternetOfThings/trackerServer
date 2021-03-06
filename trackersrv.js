/**
 * Created by Roger Jaggi on 05.11.2014.
 */
// load libraries ========================================================================
var mongoose = require('mongoose'),
    config = require('./config'),
    debug = require('debug')('trackersrv'),
    mubsub = require('mubsub'),
    S = require('string');

// setup server and config ========================================================================
var trackersrv = require('./atformat_tcpsrv');

trackersrv.config = config; //keep reference to config

// setup mongoose ========================================================================
trackersrv.db = mongoose.createConnection(config.mongodb.uri);
trackersrv.db.on('error', console.error.bind(console, 'mongoose connection error with db ' + config.mongodb.uri + ': '));
trackersrv.db.once('open', function () {
    debug('connected to mongoose db: ' + config.mongodb.uri);
});

// setup data models ========================================================================
require('./models/Tracker')(trackersrv, mongoose);
require('./models/PositionHistory')(trackersrv, mongoose);
require('./models/ConnectionLog')(trackersrv, mongoose);
require('./models/StatusHistory')(trackersrv, mongoose);

var getStatusCareU1 = function(tracker) {

    tracker.sendCommand(new trackersrv.AtCommand("vbat", null, function(err, tracker2, response, timeUsedInMS) {
        if(err) {
            debug('Error on updating TrackerStatus: ', err);
            return;
        }

        var vBat = S(response).toInteger() / 1000;

        tracker.sendCommand(new trackersrv.AtCommand("vext", null, function(err, tracker3, response, timeUsedInMS) {
            if(err) {
                debug('Error on updating TrackerStatus: ', err);
                return;
            }

            var vExt = S(response).toInteger() / 1000;

            tracker.trackerDBEntry.updateStatus(vBat, vExt);
            tracker.trackerDBEntry.addLogEntry('Updated tracker status with BatteryVoltage ' + vBat + 'V and ExternVoltage ' + vExt + 'V');
            debug('Updated tracker status with BatteryVoltage ' + vBat + 'V and ExternVoltage ' + vExt + 'V');
        }));
    }));
};

var getStatusNetModule = function(tracker) {

    tracker.sendCommand(new trackersrv.AtCommand("wanstatus", null, function(err, tracker2, response, timeUsedInMS) {
        if(err) {
            debug('Error on updating NetModule WANSTATUS: ', err);
            return;
        }

        console.log("lastWanStatus: ", response);
        tracker.trackerDBEntry.lastWanStatus = response;
        tracker.trackerDBEntry.save();

        tracker.trackerDBEntry.addLogEntry('Updated netModule WAN Status');
        debug('Updated netModule WAN Status');

        tracker.sendCommand(new trackersrv.AtCommand("gpsstatus", null, function(err, tracker2, response, timeUsedInMS) {
            if(err) {
                debug('Error on updating NetModule GPSSTATUS: ', err);
                return;
            }

            if(response.longitude == null || S(response.longitude).isEmpty() || S(response.latitude).isEmpty() || S(response.longitude).contains('n/a') || S(response.latitude).contains('n/a') ) {
                console.log("Rejected invalid GPS");
                debug('Error on updating NetModule GPSSTATUS: No GPS Position available');
                return;
            }

            console.log("lastPosition: ", response);
            tracker.trackerDBEntry.lastPosition = response;
            tracker.trackerDBEntry.save();

            tracker.trackerDBEntry.addLogEntry('Updated netModule GPS Status');
            debug('Updated netModule GPS Status');
        }));
    }));
};

// setup mubsub =======================================================================
trackersrv.mubsub = {};
trackersrv.mubsub.client = mubsub(config.mongodb.uri);
trackersrv.mubsub.channel = trackersrv.mubsub.client.channel('CommandQueue');

/*
req.app.mubsub.channel.publish('command', {
    id: uuid1,
    deviceID: tracker.deviceID,
    command: "RELAY",
    newValue: value
}); */

trackersrv.mubsub.channel.subscribe('command', function(message) {

    trackersrv.sendCommand(message.deviceID, message.command, message.newValue, function(err, tracker, response, timeUsedInMS) {
        trackersrv.mubsub.channel.publish(message.id, {
            success: !err,
            resultString: response,
            timeUsedInMS: timeUsedInMS
        });
    });
});


// setup listeners ========================================================================
trackersrv.on('trackerConnected', function(tracker) {
    debug('Tracker ' + tracker.trackerID + " connected!");

    var TrackerModel = trackersrv.db.model('tracker');

    TrackerModel.findOne({ deviceID: tracker.trackerID }, function(err, trackerDBEntry) {
        if (err) {
            throw err; //res.send(err);
        }

        if (!trackerDBEntry) {
            trackerDBEntry = new TrackerModel();

            trackerDBEntry.deviceID = tracker.trackerID;
        }
        else {

        }

        switch(tracker.deviceType) {
            case trackersrv.DeviceTypes.CAREU1_TRACKER:
                trackerDBEntry.deviceType = "CareU1 Tracker";
                break;
            case trackersrv.DeviceTypes.NETMODULE:
                trackerDBEntry.deviceType = "NetModule";
                break;

            default:
                trackerDBEntry.deviceType = "Unknown";
                break;
        }

        trackerDBEntry.status = "a";
        trackerDBEntry.save();

        tracker.trackerDBEntry = trackerDBEntry;

        tracker.trackerDBEntry.addLogEntry(null, 'Tracker connected');

        if(tracker.deviceType = trackersrv.DeviceTypes.NETMODULE) {
            tracker.trackerAbfrageIntervall = setInterval(getStatusNetModule, 2 * 60 * 1000, tracker);
        }
        else {
            tracker.trackerAbfrageIntervall = setInterval(getStatusCareU1, 2 * 60 * 1000, tracker);
        }
    });
});

trackersrv.on('trackerDisconnected', function(tracker) {

    clearInterval(tracker.trackerAbfrageIntervall);

    tracker.trackerDBEntry.status = "i";
    tracker.trackerDBEntry.save();



    debug('Tracker ' + tracker.trackerID + " disconnected!");
    tracker.trackerDBEntry.addLogEntry('Tracker disconnected!');
});

trackersrv.on('trackerIdChanged', function(tracker, oldID) {

    tracker.trackerDBEntry.deviceID = tracker.trackerID;
    tracker.trackerDBEntry.save();

    debug('Tracker changed his ID from ' + oldID + ' to ' + tracker.trackerID + "!");

    tracker.trackerDBEntry.addLogEntry('Tracker changed his ID from ' + oldID + ' to ' + tracker.trackerID + "!");
});

trackersrv.on('gpsDataReceived', function(tracker, gps) {

    tracker.trackerDBEntry.lastPosition = gps;
    tracker.trackerDBEntry.save();

    var PositionHistoryModel = trackersrv.db.model('positionHistory');

    var newEntry = new PositionHistoryModel();
    newEntry._trackerId = tracker.trackerDBEntry._id;
    newEntry.time = gps.gpstime;
    newEntry.latitude = gps.latitude;
    newEntry.longitude = gps.longitude;
    newEntry.altitude = gps.altitude;
    newEntry.speed = gps.speed;
    newEntry.direction = gps.direction;
    newEntry.satelliteCount = gps.satelliteCount;
    newEntry.save();

    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent GPS Data:' + JSON.stringify(gps));

    debug('Tracker ' + tracker.trackerID + " sent GPS: ", gps);
});

trackersrv.on('TxtDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent TextMessage: ", txtObj);
    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent TextMessage:' + JSON.stringify(txtObj));
});

trackersrv.on('GarminDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent Garmin Data: ", txtObj);
    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent Garmin Data:' + JSON.stringify(txtObj));
});

trackersrv.on('OBDDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent OBD Data: ", txtObj);
    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent OBD Data:' + JSON.stringify(txtObj));
});

trackersrv.on('heartbeatReceived', function(tracker, nr) {

    if(tracker.trackerDBEntry) {
        tracker.trackerDBEntry.status = "a";
        tracker.trackerDBEntry.save();

        tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent Heartbeat Nr. ' + nr);
    }

    debug('Tracker ' + tracker.trackerID + " sent Heartbeat Nr. " + nr);
});

trackersrv.listen(config.trackerport, function(err) {
    if(err) {
        console.log("Error starting Tissan tracker server!");
    }
    else {
        console.log("Tissan Tracker server is listening on port " + config.trackerport);
    }
});