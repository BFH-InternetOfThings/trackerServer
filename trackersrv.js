/**
 * Created by Roger Jaggi on 05.11.2014.
 */
var trackertcpsrv = require('./atformat_tcpsrv');
var S = require('string');

var config = {};
config.port = 9090;


trackertcpsrv.on('trackerConnected', function(tracker) {
   console.log('Tracker ' + tracker.trackerID + " connected!");
});

trackertcpsrv.on('trackerDisconnected', function(tracker) {
    console.log('Tracker ' + tracker.trackerID + " disconnected!");
});

trackertcpsrv.on('gpsDataReceived', function(tracker, gps) {
    console.log('Tracker ' + tracker.trackerID + " sent GPS: ", gps);
});

trackertcpsrv.on('TxtDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent TextMessage: ", txtObj);
});

trackertcpsrv.on('GarminDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent Garmin Data: ", txtObj);
});

trackertcpsrv.on('OBDDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent OBD Data: ", txtObj);
});

trackertcpsrv.listen(config.port, function(err) {
    if(err) {
        console.log("Error starting Tissan tracker server!");
    }
    else {
        console.log("Tissan Tracker server is listening on port " + config.port);
        rl.prompt();
    }
});