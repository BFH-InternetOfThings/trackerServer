/**
 * Created by roger.jaggi on 05.11.2014.
 */
var trackertcpsrv = require('trackertcpsrv');

var readline = require('readline');

var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('cmd> ');


rl.on('line', function(line) {

    if (line === "exit") {
        rl.close();
    }

    trackertcpsrv.broadcast(line);

}).on('close',function(){
    /*clients.forEach(function (client) {
        client.end(); // close socket
    }); */

    process.exit(0);
});


trackertcpsrv.listen(9090, function(err) {
    if(err) {
        console.log("Error starting Tissan tracker server!");
    }
    else {
        console.log("Tissan Tracker server is listening on port 9090");
    }
});