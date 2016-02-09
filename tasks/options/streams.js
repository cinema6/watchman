module.exports = {
    options: {
        waitTime: 5000,
        streams: ['devTimeStream', 'devWatchmanStream'],
        tables: ['devTimeStreamApplication', 'devWatchmanStreamApplication']
    },
    create: { },
    destroy: { }
};
