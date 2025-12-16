# Three.js Blocks Starter

[starter.renaudrohlinger.com](https://starter.renaudrohlinger.com)

Three Blocks Starter is an officially supported way to create single-page Three.js applications. It offers a modern build setup with no configuration.

## Quick Start

```sh
npx create-three-blocks-starter my-app
cd my-app
npm run dev
```

(npx comes with npm 5.2+ and higher, see instructions for older npm versions)

Then open http://localhost:4000/ to see your app.

When you’re ready to deploy to production, create a minified bundle with `npm run build`.

## Get Started Immediately

You don’t need to install or configure tools like webpack or Babel. They are preconfigured and hidden so that you can focus on the code.

Create a project, and you’re good to go.

## Creating an App

You’ll need to have Node >= 14 on your local development machine (but it’s not required on the server). You can use nvm (macOS/Linux) or nvm-windows to switch Node versions between different projects.

To create a new app, you may choose one of the following methods:

### npx

```sh
npx create-three-blocks-starter my-app
```

(npx comes with npm 5.2+ and higher, see instructions for older npm versions)

### npm

```sh
npm init three-blocks-starter my-app
```

`npm init <initializer>` is available in npm 6+

### Yarn

```sh
yarn create three-blocks-starter my-app
```

`yarn create` is available in Yarn 0.25+

## Selecting a package manager

When you create a new app, the CLI will use npm or Yarn to install dependencies, depending on which tool you use to run `create-three-blocks-starter`. For example:

```sh
# Run this to use npm
npx create-three-blocks-starter my-app

# Or run this to use yarn
yarn create three-blocks-starter my-app
```

## Output

Running any of these commands will create a directory called `my-app` inside the current folder. Inside that directory, it will generate the initial project structure and install the transitive dependencies:

```
my-app
├── README.md
├── node_modules
├── package.json
├── .gitignore
├── public
│   ├── favicon.ico
│   └── ...
└── src
    ├── main
    ├── offscreen
    │   ├── camera.js
    │   ├── loader.js
    │   ├── renderer.js
    │   ├── site.js
    │   ├── dispatcher
    │   ├── meshes
    │   └── utils
    ├── index.js
    └── init.js
```

No configuration or complicated folder structures, only the files you need to build your app. Once the installation is done, you can open your project folder:

```sh
cd my-app
```

## Scripts

Inside the newly created project, you can run some built-in commands:

### `npm run dev`

Runs the app in development mode. Open [http://localhost:4000](http://localhost:4000) to view it in the browser.

The page will automatically reload if you make changes to the code. You will see the build errors and lint warnings in the console.

### `npm run build`

Builds the app for production to the `dist` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.

Your app is ready to be deployed.

### `npm run preview`

Locally preview the production build.

## Credits

This architecture is heavily based on and inspired by [Antipasto](https://github.com/luruke/antipasto), a robust and feature-rich boilerplate for threejs.

## Maintainers

- [`twitter @onirenaud`](https://twitter.com/onirenaud)
- [`twitter @utsuboco`](https://twitter.com/utsuboco)
