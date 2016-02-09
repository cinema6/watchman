module.exports = {
    tdd: {
        files: [
            'src/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['jshint', 'test:unit']
    },
    vagrant: {
        files: [
            'src/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['jshint', 'test:unit', 'exec:rsync']
    }
};
