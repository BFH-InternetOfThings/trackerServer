/**
 * Created by roger on 8/29/14.
 */
'use strict';
exports = module.exports = function(app, passport) {

    // views
    app.get('/views/:name*', function (req, res) {
        var name = req.param('name') + req.param(0);
        res.render(name);
    });

    // frontend
    var frontend = require('./frontend');
    app.get('/', frontend.index);

    //app.post('/login', frontend.login);
    //app.get('/logout', frontend.logout);

    /* backend
    var backend = require('./backend');
    app.all('/admin*', app.utilities.ensureAuthenticated);
    app.get('/admin', backend.index);
    */

    // api
    var smojeAPI = require('./smojeAPI');
    var smojeAPIVersion = 'smoje-api/v1';
    //app.all('/' + apiVersion + '*', app.utilities.ensureAuthenticated);

    app.get('/' + smojeAPIVersion + '/trackerList', smojeAPI.listTrackerExtended);
    app.get('/' + smojeAPIVersion + '/list', smojeAPI.listTracker);
    app.get('/' + smojeAPIVersion + '/:trackerID/relay/:action', smojeAPI.getTrackerRelay);
    app.get('/' + smojeAPIVersion + '/:trackerID/status', smojeAPI.getTrackerStatus);
    app.get('/' + smojeAPIVersion + '/:trackerID/command/:cmd', smojeAPI.sendCommand);
    app.get('/' + smojeAPIVersion + '/:trackerID/command/:cmd/:value', smojeAPI.sendCommand);

};