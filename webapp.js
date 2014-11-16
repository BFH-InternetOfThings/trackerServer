/**
 * Created by roger on 8/28/14.
 */

// load libraries ========================================================================
var express = require('express'),
    path = require('path'),
    favicon = require('static-favicon'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    mongoose = require('mongoose'),
    session = require('express-session'),
    mongoStore = require('connect-mongo')(session),
    config = require('./config'),
    debug = require('debug')('webapp');

// setup app and config ========================================================================
var app = express();

//keep reference to config
app.config = config;

// setup mongoose ========================================================================
app.db = mongoose.createConnection(config.mongodb.uri);
app.db.on('error', console.error.bind(console, 'mongoose connection error with db ' + config.mongodb.uri + ': '));
app.db.once('open', function () {
    debug('connected to mongoose db: ' + config.mongodb.uri);
});

// setup data models ========================================================================
require('./models/Tracker')(app, mongoose);
require('./models/PositionHistory')(app, mongoose);
require('./models/ConnectionLog')(app, mongoose);
require('./models/StatusHistory')(app, mongoose);

// setup view engine ========================================================================
app.disable('x-powered-by');
app.set('port', config.port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// setup middlewares ========================================================================
app.use(favicon());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: config.cryptoKey,
    name: config.sessionCookieName,
    store: new mongoStore({ url: config.mongodb.uri }),
    proxy: true,
    resave: true,
    saveUninitialized: true
}));

// setup utilities & passport =============================================================
app.utilities = {};

// setup routes ========================================================================
require('./routes/index')(app, null);

// setup locals exposed to templates ============================================================
app.locals.projectName = app.config.projectName;
app.locals.copyrightYear = new Date().getFullYear();
app.locals.copyrightName = app.config.companyName;
app.locals.cacheBreaker = new Date().getTime();

// catch 404 and forward to error handler ========================================================================
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// setup error handlers ========================================================================
// development error handler (will print stacktrace)
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);

        //var template = req.isAuthenticated() ? 'backend/error' : 'frontend/error' ;

        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler (no stacktraces leaked to user)
app.use(function(err, req, res, next) {
    res.status(err.status || 500);

    //var template = req.isAuthenticated() ? 'error' : 'error' ;

    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;