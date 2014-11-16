/**
 * Created by Roger Jaggi on 05.11.2014.
 */
// load libraries ========================================================================
var mongoose = require('mongoose'),
    config = require('./config'),
    debug = require('debug')('trackersrv'),
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

var getStatus = function(tracker) {

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

        trackerDBEntry.status = "a";
        trackerDBEntry.save();

        tracker.trackerDBEntry = trackerDBEntry;

        tracker.trackerDBEntry.addLogEntry(null, 'Tracker connected');

        tracker.trackerAbfrageIntervall = setInterval(getStatus, 2 * 60 * 1000, tracker);

        //getStatus(tracker); tracker isn't ready here
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
    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent TextMessage:' + JSON.stringify(gps));
});

trackersrv.on('GarminDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent Garmin Data: ", txtObj);
    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent Garmin Data:' + JSON.stringify(gps));
});

trackersrv.on('OBDDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent OBD Data: ", txtObj);
    tracker.trackerDBEntry.addLogEntry(null, 'Tracker sent OBD Data:' + JSON.stringify(gps));
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