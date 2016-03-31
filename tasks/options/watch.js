module.exports = {
    tdd: {
        files: [
            'src/**/*.js',
            'lib/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['jshint', 'test:unit']
    },
    vagrant: {
        files: [
            'src/**/*.js',
            'lib/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['jshint', 'test:unit', 'exec:rsync']
    }
};
