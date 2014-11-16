/**
 * Created by roger on 8/28/14.
 */
exports = module.exports = function(app, mongoose) {

    var connectionLogSchema = new mongoose.Schema({
        _trackerId: { type: mongoose.Schema.Types.ObjectId },
        time: { type: Date, default: Date.now },
        request: { type: String },
        response: { type: String }
    });

    app.db.model('connectionLog', connectionLogSchema);
};