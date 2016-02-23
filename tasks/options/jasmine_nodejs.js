module.exports = {
    options: {
        specNameSuffix: '.js',
        stopOnFailure: false
    },
    unit: {
        specs: 'tests/unit/**/*.ut.js',
        options: {
            reporters: {
                console: {
                    colors: true,
                    indent: true
                },
                junit: {
                    savePath: 'reports',
                    filePrefix: 'unit_test_results'
                }
            }
        }
    },
    e2e: {
        specs: 'tests/e2e/**/*.e2e.js',
        options: {
            reporters: {
                console: {
                    colors: true,
                    indent: true
                },
                junit: {
                    savePath: 'reports',
                    filePrefix: 'e2e_test_results'
                }
            }
        }
    }
};
