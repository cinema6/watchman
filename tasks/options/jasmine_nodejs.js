module.exports = {
    options: {
        specNameSuffix: '.js',
        stopOnFailure: false,
        reporters: {
            console: {
                colors: true,
                indent: true
            }
        }
    },
    unit: {
        specs: 'tests/unit/**/*.ut.js'
    },
    e2e: {
        specs: 'tests/e2e/**/*.e2e.js'
    }
};
