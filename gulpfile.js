const browserSync = require('browser-sync').create();
const fs = require('fs');
const Handlebars = require('handlebars');
const { dest, parallel, series, src, watch: gulpWatch } = require('gulp');
const mjml = require('./gulp-mjml');
const mjmlEngine = require('mjml');
const path = require('path');
const argv = require('yargs').argv;
const glob = require('glob');

const templateData = {
  "imgBaseUrl": argv.imgBaseUrl,
};

// Require your own components if needed, and your mjmlEngine (possibly with options)
// require('./components')

const BUILD_DIR = './build';
const SRC_IMG_GLOB = './src/img/**/*'
const SRC_GLOB = './src/**/*';
const SRC_EMAIL_DIR = './src/emails';
const SRC_EMAIL_GLOB = './src/emails/**/*.mjml';

function handleError(err) {
  console.error(err);
  this.emit('end');
}

function buildMjml() {
  return src(SRC_EMAIL_GLOB)
    .pipe(mjml(mjmlEngine, {
      validationLevel: 'strict', preprocessors: [
        (rawMJML) => {
          const hbarsTemplate = Handlebars.compile(rawMJML);
          const compiledTemplate = hbarsTemplate(templateData);
          return compiledTemplate;
        }
      ]
    }))
    .on('error', handleError)
    .pipe(dest(BUILD_DIR));
}

function copyImages() {
  return src(SRC_IMG_GLOB)
    .pipe(dest(BUILD_DIR + '/img'));
}

function generateIndex(cb) {
  glob.glob('build/*/*.html')
    .then(files => {
      files.forEach((file) => {
        console.log(file);
        index.data.add(file);
      })
    }).then(() => {
      return index.render(cb);
    })
    .catch(err => {
      console.error(err)
    })
}

function clean(cb) {
  fs.rm(BUILD_DIR, { force: true, recursive: true }, cb);
}

function watch() {
  // All events will be watched
  gulpWatch(SRC_GLOB, { ignoreInitial: false }, buildMjml).on('all', () =>
    browserSync.reload()
  );

  gulpWatch(SRC_EMAIL_GLOB, { ignoreInitial: false }, index.render)
    .on('ready', () => {
      fs.mkdirSync('build', { recursive: true });
      browserSync.init({
        server: {
          baseDir: BUILD_DIR,
        },
      });
    })
    .on('add', (file) => index.data.add(index.format(file)))
    .on('unlink', (file) => index.data.delete(index.format(file)));

  gulpWatch(SRC_IMG_GLOB, { ignoreInitial: false }, copyImages);
}

exports.build = series(parallel(buildMjml, copyImages), generateIndex);
exports.clean = clean;
exports.watch = watch;

const index = {
  data: new Set(),
  format: (sourcePath) => {
    const parsedPath = path.parse(sourcePath);
    return path.format({
      dir: path.join(
        ...parsedPath.dir
          .split(path.sep)
          .splice(SRC_EMAIL_DIR.split('/').length - 1)
      ),
      name: parsedPath.name,
      ext: '.html',
    });
  },
  render: (cb) => {
    const data = Array.from(index.data);
    const groups = {};

    // Group the data by the first directory in their path
    data.forEach((file) => {
      file = file.replace("build\\", "");
      const splitPath = file.split(path.sep);
      const groupName = splitPath[0];
      const filePath = splitPath.slice(1).join(path.sep);

      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(filePath);
    });

    // Sort the groups and their contents
    const sortedGroups = Object.keys(groups).sort();
    sortedGroups.forEach((groupName) => {
      groups[groupName].sort();
    });

    // Generate the HTML for the index page
    const html = `
  <!DOCTYPE html>
  <html>
  <head>
  </head>
  <body>
    <h1>Email Index</h1>
    <ul>
    ${sortedGroups
        .map((groupName) => {
          return `<li><strong>${groupName}</strong><ul>${groups[groupName]
            .map((filePath) => {
              return `<li><a href="${groupName}/${filePath}">${filePath}</a></li>`;
            })
            .join('')}</ul></li>`;
        })
        .join('\n')}
    </ul>
  </body>
  </html>`;

    // Write the HTML to the build directory
    fs.writeFile(`${BUILD_DIR}/index.html`, html, cb);
  },
};