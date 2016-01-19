module.exports = {
    options: {
        specNameSuffix: '.ut.js',
        stopOnFailure: false,
        reporters: {
            console: {
                colors: true,
                indent: true,
                activity: true
            }
        }
    },
    all: {
        specs: 'tests/unit/**'
    }
};
