/**
 * Created by roger.jaggi on 05.11.2014.
 */
var trackertcpsrv = require('./atformat_tcpsrv');
var S = require('string');
var readline = require('readline');

var config = {};
config.port = 9090;


var currentClient = 0;
var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('cmd> ');


rl.on('line', function(line) {

    var data = S(line);

    if (data.startsWith("exit")) {
        rl.close();
    }
    else if(data.startsWith("list")) {

        console.log(trackertcpsrv.clients.length + " Clients are connected: ");
        for(var i = 1; i <= trackertcpsrv.clients.length; i++) {
            console.log(i + ": " + trackertcpsrv.clients[i-1].name + ",  ");
        }
        rl.prompt();
    }
    else if(data.startsWith("select")) {

        var clientNo = data.substring(6).trim().toInteger();

        if(clientNo > 0 && clientNo <= trackertcpsrv.clients.length) {
            currentClient = clientNo;
            rl.setPrompt('cmd ' + currentClient + '> ');
        }
        else if(clientNo === 0) {
            currentClient = 0;
            rl.setPrompt('cmd> ');
        }
        else {
            console.log("invalid client no. " + clientNo);
        }
        rl.prompt();
    }
    else if(currentClient > 0 && currentClient <= trackertcpsrv.clients.length) {

        var n = data.indexOf(" ");

        if(n == -1) {
            n = data.length;
        }
        var command = data.substring(0, n);
        var newValue = data.substring(n+1);

        trackertcpsrv.clients[currentClient-1].sendCommand(command,  newValue, function(err, tracker, response) {
            if(err) {
                console.log(err, tracker.trackerID, response);
            }
            else {
                console.log(tracker.trackerID, response);
            }
            rl.prompt();
        })
    }
    else {
        console.log("unknown command or no client selected. Use select <client no.>");
        rl.prompt();
    }
}).on('close',function(){

    process.exit(0);
});


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