/**
 * Created by roger on 11/16/14.
 */
function initialize() {
    //			var image = {
    //				url: 'http://demo.symphonythemes.com/drupal7/bizreview/sites/demo.symphonythemes.com.drupal7.bizreview/themes/bizreview/amarkers/green.png',
    //				size: new google.maps.Size(20, 32),
    //				origin: new google.maps.Point(0,0),
    //				anchor: new google.maps.Point(0, 32)
    //			};


    var mapOptions = {
        center: { lat: 46.91035 ,lng: 7.47096},
        zoom: 10
    };
    var map = new google.maps.Map(document.getElementById('mapHolder'), mapOptions);
    var infowindow = new google.maps.InfoWindow();

    var image = {
        url: '/images/map-marker.png',
        // This marker is 20 pixels wide by 32 pixels tall.
        size: new google.maps.Size(45, 44),
        // The origin for this image is 0,0.
        origin: new google.maps.Point(0,0),
        // The anchor for this image is the base of the flagpole at 0,32.
        anchor: new google.maps.Point(16, 44)
    };

    $.ajax({
        dataType: "json",
        url: "/smoje-api/v1/trackerList",
        success: function(data) {

            for(var i = 0; i < data.length; i++)
            {
                var tracker = data[i];

                console.log(tracker);

                var trackerPoint =  new google.maps.LatLng(tracker.lastPosition.latitude , tracker.lastPosition.longitude);

                var contentString = '<div id="mapContent">'+
                    '<h1 class="mapHeading">Tracker ' + tracker.deviceID + '</h1>'+
                    '<div id="mapContent">'+
                    '<p><b>Last update:</b><br />' + moment(tracker.timeUpdated).format("LLL")  + '</p> ' +
                    '<p><b>Status:</b> ' + ( tracker.status === "a" ? "Connected" : "Disconnected" ) + '</p> ' +
                    '<p><b>Position:</b> ' + tracker.lastPosition.latitude + ' / ' + tracker.lastPosition.longitude + '</p> ' +
                    '<p><b>Battery Voltage:</b> ' + tracker.lastBatteryVoltage + 'V</p> ' +
                    '<p><b>Extern Voltage:</b> ' + tracker.lastExternVoltage + 'V</p> ' +
                    '</div>'+
                    '</div>';

                var marker = new google.maps.Marker({
                    position: trackerPoint,
                    icon: image,
                    map: map,
                    title: 'Tracker ' + tracker.deviceID
                });

                google.maps.event.addListener(marker, 'click', function() {
                    infowindow.setContent(contentString);
                    infowindow.close();
                    infowindow.open(map,marker);
                });

            }
        }
    });

    //open Smoje1 infowindow at default on startsite
    //infowindow.setContent(contentString1);
    //infowindow.close();
    //infowindow.open(map,marker1);
}

google.maps.event.addDomListener(window, 'load', initialize);
