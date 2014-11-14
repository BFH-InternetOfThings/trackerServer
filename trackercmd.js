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
        console.log(clients.length + " Clients are connected: ");
        for(var i = 0; i < clients.length; i++) {
            console.log(i + ": " + clients[i].name + ",  ");
        }
        rl.prompt();
    }
    else if(data.startsWith("select")) {
        var clientNo = data.substring(data, 6).toInteger();

        if(currentClient > 0 && currentClient <= trackertcpsrv.clients) {
            currentClient = clientNo;
        }
        else {
            console.log("invalid client no. " + clientNo);
        }
        rl.prompt();
    }
    else if(currentClient > 0 && currentClient <= trackertcpsrv.clients) {

        trackertcpsrv.clients[currentClient - 1].sendCommand(command,  newValue, function(err, response) {
            if(err) {
                console.log(err);
            }
            else {
                console.log(response);
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




trackertcpsrv.listen(config.port, function(err) {
    if(err) {
        console.log("Error starting Tissan tracker server!");
    }
    else {
        console.log("Tissan Tracker server is listening on port " + config.port);
        rl.prompt();
    }
})