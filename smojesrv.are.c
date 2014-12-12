server = "tracker.xrj.ch";
port = (int) "9090";
// SmojeID
sArName = explode(nb_config_get("network.hostname"));
smojedd = "";

for (i = 0; i < length(sArName); i++) {
    if (isdigit(sArName[i])) {
        smojedd = strcat(smojeid,sArName[i]);
    }
}

heartbeatmessage = strcat(chr(250),chr(249),right( strcat("00", 1), 2),right( strcat("0000", smojeid), 4));
SOCKET_TIMEOUT = 300;

sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
if (sock < 0) {
    print("unable to open socket\n");
    close(sock);
    exit(1);
}

if (connect(sock, server, port) < 0){
	printf("Could not connect to %s (port %d)\n", server, port);
	close(sock);
	sleep(10);
	exit(2);
}
printf("Connected to %s (port %d)\n", server, port);

sent = send(sock, heartbeatmessage); //heartbeatmessage);
if (sent == -1) {
	print("Failed to send heartbeatmessage %s\n", heartbeatmessage);
	close(sock);
	exit(3);
}
printf("Successfully sent heartbeatmessage %s\n", heartbeatmessage);

while(1) {

	// wait for socket data
	printf("Listening for data with timeout %d s\n", SOCKET_TIMEOUT);
	rv = select(sock, SOCKET_TIMEOUT);

	if (rv == -1) {
		printf("Error during select()\n");
		close(sock);
		sleep(10 * 1000);
		continue;

	} else if (rv == 0) {
  		gpsStatus = nb_status("gnss");
		moduleType=struct_get(gpsStatus, "GNSS1_MODULE_TYPE");
		longitude=struct_get(gpsStatus, "GNSS1_LONGITUDE");
		hdop=struct_get(gpsStatus, "GNSS1_HDOP");
		gpsSystem=struct_get(gpsStatus, "GNSS1_SYSTEM");
		vdop=struct_get(gpsStatus, "GNSS1_VDOP");
		latitude=struct_get(gpsStatus, "GNSS1_LATITUDE");
		altitude=struct_get(gpsStatus, "GNSS1_ALTITUDE");
		pdop=struct_get(gpsStatus, "GNSS1_PDOP");
		satellitesNr=struct_get(gpsStatus, "GNSS1_SATELLITES_USED");
		verticalSpeed=struct_get(gpsStatus, "GNSS1_VERTICAL_SPEED");

		// structure of the gps asnyc message
		//<Modem_ID>,<GPS_DateTime>,<Longitude>,<Latitude>,<Speed>,<Direction>,<Altitude>,<Satellites>,<Message ID>,<Input Status>,<Output Status>,<Analog Input1>,<Analog Input2>,<RTC_DateTime>,<Mileage>
		// Important: this is the only message without a command prefix
		gpsOutMsg = strcat(smojeid,",",time(),",",longitude,",",latitude,",",verticalSpeed,",","n/a",",",altitude,",",satellitesNr,",",strcat(smojeid, (string)time()),",",moduleType,",",gpsSystem,",",hdop,",",vdop,",",pdop,",","0");
		printf("Sending GPS message: %s\n",gpsOutMsg);
		sent = send(sock, gpsOutMsg);
		if (sent == -1) {
			printf("Error on sending GPS\n");
		}
		// GPS is an async message an does not send error codes

  	} else {
		/* Parse Server Message */

		msg = recv(sock);
		if(!msg) {
			print("Connection closed\n");
			close(sock);
			exit(4);
		}
		else if (left(msg,2) == strcat(chr(250),chr(249))) {
		    printf("Server send Heartbeat confirmation!\n");
		}
		else if (left(msg,8) == "AT$MODID") {
            if (right(left(msg,9),1) == "?") { // read modid
                send(sock, "OK:MODID\n");
                send(sock, strcat("$MODID=",smojeid,"\n"));
            } else if (substr(msg,9,1) == "=") { // write modid
                smojeid = substr(msg,10);
                send(sock, "OK:MODID\n");
            } else {
                send(sock, "ERROR:MODID\n");
            }
	    } else if (left(msg,8) == "AT$RELAY") { /* Switch on/off: Digital I/O; Signature AT$RELAY=<dioPortNr(1|2)>,<state(0|1|2|3)> */
		    if (right(left(msg,9),1) == "?") {
				send(sock, "OK:RELAY\n");
				send(sock, strcat("$RELAY=","out1:",nb_dio_get("out1"),";","out2:",nb_dio_get("out2"),"\n"));
		    } else if (right(left(msg,9),1) == "=") {
                // Cicle
                if (right(left(msg,11),1) == "2" || right(left(msg,11),1) == "3") {
                        dioset = nb_dio_set(strcat("out", right(left(msg,10),1)), 0);
                        sleep(2);
                        // Long cicle
                        if (right(left(msg,11),1) == "3") {
                            sleep(15);
                        }
                        dioset = nb_dio_set(strcat("out", right(left(msg,10),1)), 1);
                        if (dioset == 0) {
                            send(sock, "OK:RELAY\n");
                            send(sock, strcat("$RELAY=",right(left(msg,10),1),":",right(left(msg,11),1),"\n"));
                        } else {
                            send(sock, "ERROR:RELAY");
                        }
                    } else {
                        dioset = nb_dio_set(strcat("out", right(left(msg,10),1)), (int)right(left(msg,11),1));

                        if (dioset == 0) {
                            send(sock, "OK:RELAY\n");
                            send(sock, strcat("$RELAY=",right(left(msg,10),1),":",right(left(msg,11),1),"\n"));
                        }
                }
			} else {
				send(sock, "ERROR:RELAY\n");
			}
		}
        else if (left(msg,12) == "AT$WANSTATUS") {
            if (right(left(msg,13),1) == "?") { // read status
                printf("Received WAN-Status command, read and send it");
                state = nb_status("wan");
                send(sock, "OK:WANSTATUS\n");
                send(sock, strcat("$WANSTATUS=",struct_get(state , "WANLINK1_GATEWAY"),",",struct_get(state , "WANLINK1_STATE"),",",struct_get(state , "WANLINK1_STATE_UP_SINCE"),",",struct_get(state , "WANLINK1_DIAL_ATTEMPTS"),",",struct_get(state , "WANLINK1_DATA_UPLOADED"),",",struct_get(state , "WANLINK1_DIAL_SUCCESS"),",",struct_get(state , "WANLINK1_ADDRESS"),",",struct_get(state , "WANLINK1_DOWNLOAD_RATE"),",",struct_get(state , "WANLINK1_SERVICE_TYPE"),",",struct_get(state , "WANLINK1_UPLOAD_RATE"),",",struct_get(state , "WANLINK1_TYPE"),",",struct_get(state , "WANLINK1_DIAL_FAILURES"),",",struct_get(state , "WANLINK1_REGISTRATION_STATE"),",",struct_get(state , "WANLINK1_SIM"),",",struct_get(state , "WANLINK1_INTERFACE"),",",struct_get(state , "WANLINK1_DATA_DOWNLOADED"),",",struct_get(state , "WAN_HOTLINK"),",",struct_get(state , "WANLINK1_SIGNAL_STRENGTH"),"\n"));
            } else { // write Status
                send(sock, "ERROR:WANSTATUS\n");
            }
        }
        else {
            printf("Got unknown message: %s\n", msg);
        }
    }
}

close(sock);
exit(0);