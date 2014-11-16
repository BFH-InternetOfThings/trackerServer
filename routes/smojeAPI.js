'use strict';

exports.listTrackers = function(req, res){

    res.
    res.render('index', {
        oauthMessage: ''
    });

};

exports.listTrackers = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.find({}, function(err, trackers) {
        res.json(trackers);
    })
};

exports.getTrackerGPS = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ _id: req.params.trackerID }, function(err, tracker) {
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

exports.getTrackerRelay = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ _id: req.params.trackerID }, function(err, tracker) {
        if (err) {
            res.status(500);
            return res.send(err);
        }

        if(!tracker) {
            res.status(404);
            return res.send(err);
        }

        res.json({
            status: tracker.relay1
        });
    });
};

exports.getTrackerStatus = function(req, res){

    var TrackerModel = req.app.db.model('tracker');

    TrackerModel.findOne({ _id: req.params.trackerID }, function(err, tracker) {
        if (err) {
            res.status(500);
            return res.send(err);
        }

        if(!tracker) {
            res.status(404);
            return res.send(err);
        }

        res.json({
            smojeid: tracker.deviceID,
            powerstatus: {
                vbattery: tracker.lastBatteryVoltage,
                vextern: tracker.lastExternVoltage,
                estimatedruntime: tracker.estimatedruntime
            }
        });
    });
};
