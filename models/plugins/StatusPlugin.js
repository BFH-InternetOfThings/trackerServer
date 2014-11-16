/**
 * Created by roger on 9/2/14.
 */
module.exports = exports = function statusPlugin(schema, options) {
    schema.add({
        status: { type: String, default: "a"},
        timeCreated: { type: Date, default: Date.now },
        timeUpdated: { type: Date, default: Date.now }
    });

    schema.statics.STATUSTYPES = {
        ACTIVE: { value: "a", name: "Active"},
        INACTIVE: { value: "i", name: "Inactive"},
        LOCKED: { value: "l", name: "locked"},
        NEED_TO_VERIFY_EMAIL: { value: "v", name: "Need to verify email"}
    };

    schema.pre('save', function (next) {
        this.timeUpdated = new Date;
        next()
    });

    if (options && options.index) {
        schema.path('status').index(options.index);
        schema.path('timeCreated').index(options.index);
        schema.path('timeUpdated').index(options.index);
    }
};