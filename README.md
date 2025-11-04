# PromptSync Web

Gestor de prompts para IA con interfaz web.

## Cómo usar

1. Abre `index.html` en tu navegador
2. La primera vez te preguntará si quieres cargar datos de ejemplo - acepta
3. Usa los filtros para buscar prompts
4. Haz clic en 📋 para copiar un prompt
5. Haz clic en [+] para crear nuevos prompts

## Funciones principales

- **Gestión de prompts**: Crear, editar, eliminar
- **Organización**: Carpetas jerárquicas
- **Variantes**: Diferentes versiones de IA (ChatGPT, Claude, etc.)
- **Filtros**: Por carpeta, variante o texto
- **Exportar/Importar**: Backup de datos en JSON
- **Editor rico**: Formato con Quill.js
- **Temas**: Claro/Oscuro/Automático

## Estructura

- `index.html` - Interfaz principal
- `app.js` - Lógica de la aplicación
- `style.css` - Estilos y temas
- `default_data.json` - Datos de ejemplo