'use strict';
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

        res.json({
            status: tracker.relay1 ? tracker.relay1 : "unknown"
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
