/**
 * Created by Roger Jaggi on 16. Nov. 2014
 */
exports = module.exports = function(app, mongoose) {
    var trackerSchema = new mongoose.Schema({
        deviceID: { type: String },
        deviceType: { type: String },
        lastPosition: { type: mongoose.Schema.Types.Mixed },
        lastBatteryVoltage: { type: Number },
        lastExternVoltage: { type: Number },
        lastEstimatedRuntime: { type: Number },
        lastWanStatus: { type: mongoose.Schema.Types.Mixed }
    });

    trackerSchema.methods.addLogEntry = function(request, response) {

        var ConnectionLogModel = app.db.model('connectionLog');
        var logEntry = new ConnectionLogModel();

        logEntry._trackerId = this._id;
        logEntry.request = request;
        logEntry.response = response;
        logEntry.save();
    };

    trackerSchema.methods.updateStatus = function(batteryVoltage, externVoltage) {

        this.lastBatteryVoltage = batteryVoltage;
        this.lastExternVoltage = externVoltage;
        this.save();

        var StatusHistoryModel = app.db.model('statusHistory');
        var logEntry = new StatusHistoryModel();

        logEntry._trackerId = this._id;
        logEntry.batteryVoltage = batteryVoltage;
        logEntry.externVoltage = externVoltage;
        logEntry.save();
    };

    trackerSchema.plugin(require('./plugins/StatusPlugin'));
    //userSchema.plugin(require('./plugins/pagedFind'));
    trackerSchema.index({ timeCreated: 1 });
    trackerSchema.index({ search: 1 });
    //trackerSchema.set('autoIndex', (app.get('env') === 'development'));

    app.db.model('tracker', trackerSchema);
};