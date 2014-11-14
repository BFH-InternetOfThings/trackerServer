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
        var clients = trackertcpsrv.clients;
        for(var i = 0; i < clients.length; i++) {
            rl.write(i + ") " + clients[i].name);
        }
    }
    else if(data.startsWith("select")) {
        var clientNo = data.substring(data, 6).toInteger();

        if(currentClient > 0 && currentClient <= trackertcpsrv.clients) {
            currentClient = clientNo;
        }
        else {
            rl.write("invalid client no. " + clientNo);
        }
    }
    else if(currentClient > 0 && currentClient <= trackertcpsrv.clients) {

        trackertcpsrv.clients[currentClient - 1].sendCommand(command,  newValue, function(err, response) {
            if(err) {
                rl.write(err);
            }
            else {
                rl.write(response);
            }
        })
    }
    else {
        rl.write("unknown command or no client selected. Use select <client no.>")
    }

}).on('close',function(){

    process.exit(0);
});




trackertcpsrv.listen(config.port, function(err) {
    if(err) {
        console.log("Error starting Tissan tracker server!");
    }
    else {
        console.log("Tissan Tracker server is listening on port " + config.port);
        rl.prompt();
    }
})