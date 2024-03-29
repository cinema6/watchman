module.exports = {
    tdd: {
        files: [
            'src/**/*.js',
            'lib/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['eslint', 'test:unit']
    },
    vagrant: {
        files: [
            'src/**/*.js',
            'lib/**/*.js',
            'tests/**/*.js',
            'Gruntfile.js',
            'scripts/**/*.js'
        ],
        tasks: ['eslint', 'test:unit', 'exec:rsync']
    }
};
