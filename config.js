/**
 * Created by roger on 8/28/14.
 */
'use strict';

exports.port = process.env.PORT || 3000;
exports.trackerport = process.env.PORT || 9090;

exports.mongodb = {
    uri: process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/tracker'
};
exports.companyName = 'Roger Jaggi';
exports.projectName = 'Smoje Tracker Server';
exports.systemEmail = 'roger.jaggi@gmail.com';

exports.sessionCookieName = 'trackerSrv.sid';
exports.cryptoKey = 'Thuiuddsdfl2as';