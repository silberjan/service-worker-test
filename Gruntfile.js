/**
@toc
2. load grunt plugins
3. init
4. setup variables
5. grunt.initConfig
6. register grunt tasks

*/

'use strict';

module.exports = function(grunt) {

  /**
  Load grunt plugins
  @toc 2.
  */
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-sass');
  grunt.loadNpmTasks('grunt-browser-sync');

  /**
  Function that wraps everything to allow dynamically setting/changing grunt options and config later by grunt task. This init function is called once immediately (for using the default grunt options, config, and setup) and then may be called again AFTER updating grunt (command line) options.
  @toc 3.
  @method init
  */
  function init() {
    /**
    Project configuration.
    @toc 5.
    */
    grunt.initConfig({
      browserSync: {
          bsFiles: {
              src : [
                'css/*.css',
                'index.html',
                'js/**/*.js'
              ]
          },
          options: {
              watchTask: true,
              port: 1337,
              server: {
                  baseDir: "./",
                  middleware: function (req, res, next) {
                      res.setHeader('Access-Control-Allow-Origin', '*');
                      next();
                  }
              }
          }
      },
      sass: {
          options: {
              sourceMap: true
          },
          dist: {
            files: [{
                expand: true,
                cwd: 'sass/',
                src: ['*.scss'],
                dest: 'css/',
                ext: '.css'
            }],
          }
      },
      watch: {
        options: {
          livereload: true
        },
        sass: {
          files: ['sass/**/*.{scss,sass,js,html}'],
          tasks: ['sass:dist'],
        },
        html: {
          files: ['index.html'],
        },
        js: {
          files: ['js/**/*.js'],
        },
      },
    });


    /**
    register/define grunt tasks
    @toc 6.
    */
    // Default task(s).
    grunt.registerTask('default', ['browserSync', 'watch']);

  }
  init({});   //initialize here for defaults (init may be called again later within a task)

};
