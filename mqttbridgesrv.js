/**
 * Created by Roger Jaggi on 06.07.2015.
 */
// load libraries ========================================================================
var config = require('./config'),
    debug = require('debug')('mqttbridge'),
    mqtt = require('mqtt'),
    mqttrouter = require('mqtt-router'),
    S = require('string');

// setup server and config ========================================================================
var trackersrv = require('./atformat_tcpsrv');
var deviceType = 'tracker';

// mqtt connect
var mqttClient = mqtt.connect('mqtt://web:1234@formula.xrj.ch');

// enable the subscription router
var router = mqttrouter.wrap(mqttClient);

// MQTT Handlers
router.subscribe('/' + deviceType + '/+:device/command', function(topic, message, params){

    var elements = S(message).toString().split("=");
    var command = '';
    var newValue = null;

    if(elements.length > 1) {
        command = elements.shift();
        newValue = elements.join("=");
    }
    else {
        command = message;
    }

    debug('Tracker ' + params.device + " command " + command + "=" + newValue );

    trackersrv.sendCommand(params.device, command, newValue, function(err, tracker, response, timeUsedInMS) {

        mqttClient.publish('/' + deviceType + '/' + params.device + '/commandresult', JSON.stringify({
            success: !err,
            resultString: response,
            errorString: S(err).toString(),
            timeUsedInMS: timeUsedInMS
        }));
    });
});

// setup listeners ========================================================================
trackersrv.on('trackerConnected', function(tracker) {
    debug('Tracker ' + tracker.trackerID + " connected!");

    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/status', 'connected,heartbeat:0');
});

trackersrv.on('trackerDisconnected', function(tracker) {

    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/status', 'disconnected');
});

trackersrv.on('trackerIdChanged', function(tracker, oldID) {

    mqttClient.publish('/' + deviceType + '/' + oldID + '/changedID', S(tracker.trackerID).toString());
});

trackersrv.on('gpsDataReceived', function(tracker, gps) {

    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/gpsDataReceived', JSON.stringify(gps));

    debug('Tracker ' + tracker.trackerID + " sent GPS: ", gps);
});

trackersrv.on('TxtDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent TextMessage: ", txtObj);

    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/TxtDataReceived', JSON.stringify(txtObj));
});

trackersrv.on('GarminDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent Garmin Data: ", txtObj);
    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/GarminDataReceived', JSON.stringify(txtObj));
});

trackersrv.on('OBDDataReceived', function(tracker, txtObj) {
    console.log('Tracker ' + tracker.trackerID + " sent OBD Data: ", txtObj);
    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/OBDDataReceived', JSON.stringify(txtObj));
});

trackersrv.on('heartbeatReceived', function(tracker, nr) {

    mqttClient.publish('/' + deviceType + '/' + tracker.trackerID + '/status', 'connected,heartbeat:' + S(nr).toString());
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