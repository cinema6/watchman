module.exports = {
    options: {
        waitTime: 5000,
        streams: ['devTimeStream', 'devWatchmanStream', 'devCwrxStream'],
        tables: [
            'devTimeStreamApplication',
            'devWatchmanStreamApplication',
            'devCwrxStreamApplication'
        ]
    },
    create: { },
    destroy: { }
};
