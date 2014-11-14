/**
 * Created by Roger Jaggi on 05.11.2014.
 */
var trackertcpsrv = require('./atformat_tcpsrv');
var S = require('string');
var readline = require('readline');

var config = {};
config.port = 9090;


var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('cmd> ');


rl.on('line', function(line) {

    var data = S(line);

    switch (true){
        case data.startsWith("exit"):
            rl.close();
            break;

        case data.startsWith("list"):
            var clientList = "";
            for(var i = 1; i <= trackertcpsrv.clients.length; i++) {
                clientList += trackertcpsrv.clients[i-1].trackerID + ", ";
            }
            console.log(trackertcpsrv.clients.length + " Clients are connected: " + clientList.substring(0, clientList.length - 2));

            rl.prompt();
            break;

        default:
            var parts = data.split(" ");

            switch(parts.length) {
                case 0:
                case 1:
                    console.log("too few arguments");
                    rl.prompt();
                    return;
                case 2:
                    parts[2] = "";
                    break;
                default:
                    for(var j = 3; j < parts.length; j++) {
                        parts[2] += parts[j];
                    }
            }

            // 1001 VBAT
            trackertcpsrv.sendCommand(parts[0],parts[1],parts[2], function(err, tracker, response) {
                if(err) {
                    console.log(err);
                }
                else {
                    console.log(tracker.trackerID, response);
                }
                rl.prompt();
            });
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