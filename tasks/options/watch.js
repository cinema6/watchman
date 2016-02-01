module.exports = {
    vagrant: {
        files: ['src/**/*.js'],
        tasks: ['exec:rsync']
    },
    tdd: {
        files: [
            'src/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['jshint', 'test:unit']
    }
};
