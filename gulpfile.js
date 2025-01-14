const browserSync = require('browser-sync').create();
const fs = require('fs');
const Handlebars = require('handlebars');
const { dest, parallel, series, src, watch: gulpWatch } = require('gulp');
const mjml = require('./gulp-mjml');
const mjmlEngine = require('mjml');
const path = require('path');
const argv = require('yargs').argv;
const glob = require('glob');
const postcss = require('gulp-postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const templateData = {
  "imgBaseUrl": argv.imgBaseUrl,
};

// Require your own components if needed, and your mjmlEngine (possibly with options)
// require('./components')

const BUILD_DIR = './build';
const BUILD_INDEX_HTML = './build/index.html';
const SRC_IMG_GLOB = './src/img/**/*'
const SRC_INDEX_CSS = './src/index/index.css';
const SRC_GLOB = './src/**/*';
const SRC_EMAIL_DIR = './src/emails';
const SRC_EMAIL_GLOB = './src/emails/**/*.mjml';
const SRC_INDEX_HTML = './src/index/index.html';

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

function buildIndexCss() {
  return src(SRC_INDEX_CSS)
    .pipe(postcss([
      tailwindcss('./tailwind.config.js'),
      autoprefixer(),
    ]))
    .on('error', handleError)
    .pipe(dest(BUILD_DIR))
}

function generateIndex(cb) {
  glob.glob(SRC_EMAIL_GLOB)
    .then(files => {
      files.forEach((file) => {
        index.data.add(index.format(file));
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
  gulpWatch([SRC_GLOB, SRC_INDEX_HTML], { ignoreInitial: false }, buildMjml).on('all', () =>
    browserSync.reload()
  );

  gulpWatch([SRC_EMAIL_GLOB, SRC_INDEX_HTML], { ignoreInitial: false }, index.render)
    .on('ready', () => {
      fs.mkdirSync('build', { recursive: true });
      browserSync.init({
        server: {
          baseDir: BUILD_DIR,
        },
      });
    })
    .on('add', (file) => {
      if (file.endsWith('.mjml')) {
        index.data.add(index.format(file));
      }
    })
    .on('unlink', (file) => index.data.delete(index.format(file)));

  gulpWatch(SRC_IMG_GLOB, { ignoreInitial: false }, copyImages);
  gulpWatch([BUILD_INDEX_HTML, SRC_INDEX_CSS], { ignoreInitial: false }, buildIndexCss);
}

exports.build = series(parallel(buildMjml, copyImages), generateIndex, buildIndexCss);
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
    const templateBuffer = fs.readFileSync(SRC_INDEX_HTML);
    const templateString = templateBuffer.toString('utf8');
    const template = Handlebars.compile(templateString)
    const directory = sortedGroups.map((groupName) => {
      return {
        name: groupName,
        values: groups[groupName],
      }
    })
    const html = template({
      directory,
    });

    // Write the HTML to the build directory
    fs.writeFile(`${BUILD_DIR}/index.html`, html, cb);
  },
};