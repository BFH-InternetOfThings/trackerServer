/**
 * Created by roger on 8/28/14.
 */
exports = module.exports = function(app, mongoose) {

    var positionHistroySchema = new mongoose.Schema({
        _trackerId: { type: mongoose.Schema.Types.ObjectId },
        time: { type: Date, default: Date.now },
        latitude: {type: Number },
        longitude: {type: Number },
        altitude: {type: Number },
        speed: {type: Number },
        direction: {type: Number },
        satelliteCount: {type: Number }
    });

    app.db.model('positionHistory', positionHistroySchema);
};