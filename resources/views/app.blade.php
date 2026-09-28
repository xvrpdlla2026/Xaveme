<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="{{ csrf_token() }}">
<title>Notebook</title>
<meta name="description" content="Notes, folders and tasks in one workspace.">
<script>
  try {
    var t = JSON.parse(localStorage.getItem('notebook.theme'));
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    var p = JSON.parse(localStorage.getItem('notebook.palette'));
    if (['teal', 'amber', 'rose', 'violet', 'graphite'].indexOf(p) !== -1) {
      document.documentElement.setAttribute('data-palette', p);
    }
  } catch (e) { /* first run */ }
</script>
@vite(['resources/css/app.css', 'resources/js/main.tsx'])
</head>
<body>
<div id="app"></div>
</body>
</html>
