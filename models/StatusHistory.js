/**
 * Created by roger on 8/28/14.
 */
exports = module.exports = function(app, mongoose) {

    var statusHistorySchema = new mongoose.Schema({
        _trackerId: { type: mongoose.Schema.Types.ObjectId },
        time: { type: Date, default: Date.now },
        batteryVoltage: {type: Number },
        externVoltage: {type: Number },
        estimatedRuntime: { type: Number}
    });

    app.db.model('statusHistory', statusHistorySchema);
};