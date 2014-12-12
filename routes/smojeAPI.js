'use strict';

var uuid = require('node-uuid');

exports.listTrackerExtended = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.find({}, function(err, trackers) {
        res.json(trackers);
    })
};

exports.listTracker = function(req, res){

    var TrackerModel = req.app.db.model('tracker');


    TrackerModel.find({}, function(err, trackers) {
        var trackerList = [];

        for(var i = 0; i < trackers.length; i++) {
            trackerList.push(trackers[i].deviceID);
        }

        res.json(trackerList);
    });
};

exports.getTrackerRelay = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ deviceID: req.params.trackerID }, function(err, tracker) {
        if (err) {
            res.status(500);
            return res.send(err);
        }

        if(!tracker) {
            res.status(404);
            return res.send(err);
        }

        if(req.params.action == "on" || req.params.action == "off" || req.params.action == "cycle" || req.params.action == "longcycle") {

            var uuid1 = uuid.v1();

            req.app.mubsub.channel.subscribe(uuid1, function(message) {
                res.json(message);
            });

            var value = 20; //relay 2
            if(req.params.action == "on") {
                value += 1;
            }
            else if(req.params.action == "off") {
                value += 0;
            }
            else if(req.params.action == "cycle") {
                value += 2;
            }
            else if(req.params.action == "longcycle") {
                value += 3;
            }

            req.app.mubsub.channel.publish('command', {
                id: uuid1,
                deviceID: tracker.deviceID,
                command: "RELAY",
                newValue: value
            });
        }
        else {
            res.json({
                status: tracker.relay1 ? tracker.relay1 : "unknown"
            });
        }
    });
};

exports.sendCommand = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ deviceID: req.params.trackerID }, function(err, tracker) {
        if (err) {
            res.status(500);
            return res.send(err);
        }

        if(!tracker) {
            res.status(404);
            return res.send(err);
        }

        var uuid1 = uuid.v1();

        req.app.mubsub.channel.subscribe(uuid1, function(message) {
            res.json(message);
        });

        req.app.mubsub.channel.publish('command', {
            id: uuid1,
            deviceID: tracker.deviceID,
            command: req.params.cmd,
            newValue: req.params.value
        });
    });
};

exports.getTrackerStatus = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ deviceID: req.params.trackerID }, function(err, tracker) {
        if (err) {
            res.status(500);
            return res.send(err);
        }

        if(!tracker) {
            res.status(404);
            return res.send(err);
        }

        res.json(tracker);
    });
};

exports.getGPSStatus = function(req, res) {
    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ deviceID: req.params.trackerID }, function(err, tracker) {
        if (err) {
            res.status(500);
            return res.send(err);
        }

        if(!tracker) {
            res.status(404);
            return res.send(err);
        }

        res.json(tracker.lastPosition);
    });
};
