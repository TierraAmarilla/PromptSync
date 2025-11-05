// side-panel.js

// --- Datos iniciales (se cargan desde chrome.storage)
let data = {
  prompts: [],
  folders: [],
  variants: []
};

// --- Configuración inicial (se carga desde chrome.storage)
let config = {
  theme: 'auto',
};

// Paleta de colores para las etiquetas de variantes
const VARIANT_COLORS = [
  '#007acc', // Azul
  '#ca5100', // Naranja
  '#4caf50', // Verde
  '#9c27b0', // Púrpura
  '#f44336', // Rojo
  '#009688', // Teal
  '#e91e63', // Rosa
  '#673ab7', // Índigo
];

// Variable global para mantener la instancia de Quill
let quillInstance = null;

// Variable para controlar el modo de depuración
const DEBUG_MODE = false;

// --- Funciones auxiliares ---
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Sistema de logging condicional. Solo muestra logs si DEBUG_MODE es true.
 * @param {...any} args - Argumentos a pasar a console.log.
 */
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}



/**
 * Obtiene una lista de IDs de una carpeta y todas sus descendientes.
 * @param {string} folderId - El ID de la carpeta inicial.
 * @returns {string[]} Una lista de IDs de carpetas.
 * @param {Set<string>} visited - (Uso interno) Set para detectar ciclos.
 */
function getDescendantFolderIds(folderId, visited = new Set()) {
  if (visited.has(folderId)) {
    debugLog(`Ciclo detectado en la estructura de carpetas con ID: ${folderId}`);
    return []; // Romper el ciclo
  }
  visited.add(folderId);

  const children = data.folders.filter(f => f.parentId === folderId);
  const descendantIds = children.flatMap(child => getDescendantFolderIds(child.id, visited));
  return [folderId, ...descendantIds];
}

/**
 * Convierte HTML a Markdown usando Turndown.
 * Esta función se usará solo al copiar.
 * @param {string} htmlContent 
 * @returns {string}
 */
function convertHTMLToMarkdown(htmlContent) {
  if (!htmlContent || !window.TurndownService) return '';
  const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  return turndownService.turndown(htmlContent);
}

/**
 * Valida que una URL sea segura para abrir (solo http o https).
 * @param {string} url - La URL a validar.
 * @returns {boolean} - True si la URL es segura.
 */
function isValidHttpUrl(url) {
  if (!url) return false;
  try {
    const newUrl = new URL(url);
    return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Sanitiza un string para prevenir XSS, eliminando etiquetas HTML.
 * @param {string | null | undefined} str - El string a sanitizar.
 * @returns {string} - El string sanitizado.
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

function sanitizeHTML(html) {
  if (typeof html !== 'string') return '';

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Eliminar etiquetas peligrosas
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed'];
  dangerousTags.forEach(tag => {
    tempDiv.querySelectorAll(tag).forEach(el => el.remove());
  });

  // Eliminar atributos peligrosos de todos los elementos
  const dangerousAttrs = ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'oninput'];
  tempDiv.querySelectorAll('*').forEach(el => {
    dangerousAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    });
  });

  return tempDiv.innerHTML;
}
// --- Funciones de Almacenamiento (localStorage) ---
function saveToStorage() {
  try {
    debugLog("=== INICIO: GUARDADO EN STORAGE ===");
    debugLog("Datos a guardar:", {
      numPrompts: data.prompts?.length || 0,
      numFolders: data.folders?.length || 0,
      numVariants: data.variants?.length || 0,
      tamanioTotal: JSON.stringify(data).length + " bytes"
    });

    localStorage.setItem('prompts', JSON.stringify(data.prompts));
    localStorage.setItem('folders', JSON.stringify(data.folders));
    localStorage.setItem('variants', JSON.stringify(data.variants));
    localStorage.setItem('lastSaved', new Date().toISOString());

    debugLog("=== FIN: GUARDADO EN STORAGE ===");
    showToast("Datos guardados correctamente");
  } catch (e) {
    console.error("Error detallado al guardar datos:", {
      mensaje: e.message,
      nombre: e.name,
      stack: e.stack
    });
    showToast("Error al guardar datos: " + e.message, true);
  }
}

function loadFromStorage() {
  try {
    debugLog("=== INICIO DE CARGA DE DATOS ===");
    debugLog("Solicitando datos a localStorage...");

    const prompts = JSON.parse(localStorage.getItem('prompts') || 'null');
    const folders = JSON.parse(localStorage.getItem('folders') || 'null');
    const variants = JSON.parse(localStorage.getItem('variants') || 'null');
    
    const result = { prompts, folders, variants };
    
    const datosCargados = {
      prompts: Array.isArray(result.prompts),
      folders: Array.isArray(result.folders),
      variants: Array.isArray(result.variants),
      numPrompts: result.prompts?.length || 0,
      numFolders: result.folders?.length || 0,
      numVariants: result.variants?.length || 0
    };
    
    debugLog("Estado de datos en storage:", datosCargados);

    const noHayDatos = !result.prompts && !result.folders && !result.variants;
    const datosVacios = (
      Array.isArray(result.prompts) && result.prompts.length === 0 &&
      Array.isArray(result.folders) && result.folders.length === 0 &&
      Array.isArray(result.variants) && result.variants.length === 0
    );
    
    if (noHayDatos || datosVacios) {
      debugLog("No hay datos o están vacíos - Ofreciendo cargar datos por defecto");
      try {
        const loadDefaults = confirm(
          "No se encontraron datos guardados.\n\n" +
          "¿Deseas cargar un conjunto de ejemplos predefinidos?\n" +
          "(Recomendado para probar la funcionalidad)"
        );
        
        if (loadDefaults) {
          debugLog("Usuario aceptó cargar datos por defecto");
          loadDefaultDataFromFile();
          return;
        } else {
          debugLog("Usuario rechazó cargar datos por defecto");
          data = {
            prompts: [],
            folders: [],
            variants: []
          };
          saveToStorage();
        }
      } catch (defError) {
        console.error("Error al manejar carga de datos por defecto:", defError);
        showToast("Error al cargar datos por defecto. Iniciando con datos vacíos.", true);
        data = { prompts: [], folders: [], variants: [] };
        saveToStorage();
      }
    } else {
      debugLog("Datos encontrados en storage - Normalizando estructura");
      data = {
        prompts: Array.isArray(result.prompts) ? result.prompts : [],
        folders: Array.isArray(result.folders) ? result.folders : [],
        variants: Array.isArray(result.variants) ? result.variants : []
      };
    }
    
    debugLog("=== RESUMEN FINAL DE DATOS ===");
    debugLog("Prompts:", data.prompts.length);
    debugLog("Folders:", data.folders.length);
    debugLog("Variants:", data.variants.length);

    if (data.prompts.length === 0 && data.folders.length === 0 && data.variants.length === 0) {
      showToast("No hay prompts guardados. Puedes crear uno nuevo o importar datos.", false);
    }
  } catch (e) {
    console.error("Error crítico al cargar datos:", {
      mensaje: e.message,
      nombre: e.name,
      stack: e.stack
    });
    
    // Intentar recuperación con datos vacíos
    data = {
      prompts: [],
      folders: [],
      variants: []
    };
    
    saveToStorage();
    showToast("Error al cargar datos. Se han inicializado datos vacíos: " + e.message, true);
  }
}

async function loadDefaultDataFromFile() {
  try {
    debugLog("=== INICIO: CARGA DE DATOS POR DEFECTO ===");
    const fileUrl = 'default_data.json';
    debugLog("URL del archivo:", fileUrl);
    debugLog("Iniciando fetch...");
    const response = await fetch(fileUrl);
    debugLog("Estado de la respuesta:", response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    debugLog("Parseando respuesta a JSON...");
    const defaultData = await response.json();

    const validacion = {
      tienePrompts: Array.isArray(defaultData.prompts),
      numPrompts: defaultData.prompts?.length || 0,
      tieneFolders: Array.isArray(defaultData.folders),
      numFolders: defaultData.folders?.length || 0,
      tieneVariants: Array.isArray(defaultData.variants),
      numVariants: defaultData.variants?.length || 0
    };
    debugLog("Validación de datos:", validacion);

    if (!validacion.tienePrompts || !validacion.tieneFolders || !validacion.tieneVariants) {
      throw new Error("Datos inválidos - falta algún array requerido");
    }
    if (validacion.numPrompts === 0 && validacion.numFolders === 0 && validacion.numVariants === 0) {
      throw new Error("Datos inválidos - todos los arrays están vacíos");
    }

    debugLog("Actualizando datos globales...");
    data = {
      prompts: [...defaultData.prompts],
      folders: [...defaultData.folders],
      variants: [...defaultData.variants]
    };

    debugLog("Guardando en storage...");
    saveToStorage();
    debugLog("Datos guardados exitosamente");
    debugLog("Actualizando interfaz...");
    renderFolders();
    renderVariants();
    renderFolderFilter();
    renderVariantFilter();
    renderPrompts();
    
    debugLog("=== FIN: CARGA DE DATOS POR DEFECTO ===");
    debugLog("Resumen final:", {
      prompts: data.prompts.length,
      folders: data.folders.length,
      variants: data.variants.length
    });
    
    showToast("Datos de ejemplo cargados correctamente");
    return true;
    
  } catch (error) {
    console.error("Error detallado al cargar datos por defecto:", {
      mensaje: error.message,
      nombre: error.name,
      stack: error.stack
    });
    showToast("Error al cargar datos por defecto: " + error.message, true);
    
    // Inicializar con arrays vacíos en caso de error
    data = {
      prompts: [],
      folders: [],
      variants: []
    };
    saveToStorage();
    return false;
  }
}

function saveConfigToStorage() {
  try {
    localStorage.setItem('config', JSON.stringify(config));
    debugLog("Config guardada en local.");
  } catch (e) {
    console.error("Error al guardar config en local:", e);
    showToast("Error al guardar config: " + e.message, true);
  }
}

function loadConfigFromStorage() {
  try {
    const savedConfig = localStorage.getItem('config');
    if (savedConfig) {
      config = { ...config, ...JSON.parse(savedConfig) };
      debugLog("Config cargada desde local:", config);
    } else {
      debugLog("No se encontró config guardada, usando valores por defecto.");
    }
  } catch (e) {
    console.error("Error al cargar config de local:", e);
    showToast("Error al cargar config: " + e.message, true);
  }
}

// --- Manejo de tema ---
function applyTheme(theme = config.theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('theme-dark');
  } else if (theme === 'light') {
    root.classList.remove('theme-dark');
  } else { // 'auto'
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('theme-dark');
    } else {
      root.classList.remove('theme-dark');
    }
  }
}

// --- Caché y construcción del árbol de carpetas ---
let folderTreeCache = null;

function invalidateFolderTreeCache() {
  folderTreeCache = null;
}

function buildFolderTree() {
  if (folderTreeCache) {
    return folderTreeCache;
  }

  const map = {};
  const roots = [];
  data.folders.forEach(f => {
    map[f.id] = { ...f, children: [] };
  });
  data.folders.forEach(f => {
    if (f.parentId && map[f.parentId]) {
      map[f.parentId].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  folderTreeCache = roots;
  return roots;
}

// --- Renderizado (mantiene la lógica anterior) ---
function renderFolders() {
  const roots = buildFolderTree();

  function renderTree(items, level = 0) {
    const container = document.createDocumentFragment();
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = `folder-item indent-${level}`;
      div.textContent = item.name;
      div.dataset.id = item.id;
      div.addEventListener('click', () => openFolderModal(item.id));
      container.appendChild(div);

      if (item.children.length > 0) {
        container.appendChild(renderTree(item.children, level + 1));
      }
    });
    return container;
  }

  const configContainer = document.getElementById('folder-tree-config');
  configContainer.innerHTML = '';
  configContainer.appendChild(renderTree(roots));
}

function renderVariants() {
  const container = document.getElementById('variant-list-config');
  container.innerHTML = '';

  data.variants.forEach(v => {
    const div = document.createElement('div');
    div.className = 'variant-item';
    div.dataset.id = v.id;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${v.id}: ${v.name}`;
    div.appendChild(nameSpan);

    if (v.url) {
      const urlBtn = document.createElement('button');
      urlBtn.className = 'btn-icon url-btn';
      urlBtn.innerHTML = '🌐';
      urlBtn.title = 'Abrir sitio web';
      urlBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Evitar que se abra el modal de edición
        if (isValidHttpUrl(v.url)) {
          window.open(v.url, '_blank');
        } else {
          showToast(`URL no válida o insegura: ${v.url}`, true);
        }
      });
      div.appendChild(urlBtn);
    }

    div.addEventListener('click', () => openVariantModal(v.id));
    container.appendChild(div);
  });
}

function renderFolderFilter() {
  const select = document.getElementById('folder-filter');
  select.innerHTML = '<option value="">Todas las carpetas</option>';
  const roots = buildFolderTree();

  function populateSelect(items, level = 0) {
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      // Usar espacios de no ruptura (\u00A0) para la indentación, ya que los espacios normales se eliminan.
      opt.textContent = '\u00A0'.repeat(level * 4) + item.name;
      fragment.appendChild(opt);

      if (item.children.length > 0) {
        fragment.appendChild(populateSelect(item.children, level + 1));
      }
    });
    return fragment;
  }
  select.appendChild(populateSelect(roots));
}

function renderVariantFilter() {
  const select = document.getElementById('variant-filter');
  select.innerHTML = '<option value="">Todas las variantes</option>';
  data.variants.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    select.appendChild(opt);
  });
}

function renderPrompts() {
  const container = document.getElementById('prompt-list');
  container.innerHTML = '';

  const search = document.getElementById('search-input').value.toLowerCase();
  const folderFilter = document.getElementById('folder-filter').value;
  const variantFilter = document.getElementById('variant-filter').value;

  let filtered = data.prompts;

  // Aplicar filtros
  if (search) {
    filtered = filtered.filter(p => p.title.toLowerCase().includes(search) || p.general.toLowerCase().includes(search));
  }
  if (folderFilter) {
    const folderIdsToShow = getDescendantFolderIds(folderFilter);
    filtered = filtered.filter(p => folderIdsToShow.includes(p.folderId));
  }
  if (variantFilter) { // <-- Aplicamos el filtro de variante
    const vId = parseInt(variantFilter, 10);
    if (!isNaN(vId)) { // Aseguramos que sea un número válido
        filtered = filtered.filter(p => p.variants.includes(vId));
    }
  }

  // Usar DocumentFragment para optimizar el renderizado
  const fragment = document.createDocumentFragment();

  // Si no hay resultados, mostrar un mensaje
  if (filtered.length === 0) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'empty-list-message';
    if (search) {
      messageDiv.textContent = `No se encontraron resultados para "${search}"`;
    } else if (folderFilter) {
      messageDiv.textContent = 'Esta carpeta (y sus subcarpetas) está vacía.';
    } else if (variantFilter) {
      messageDiv.textContent = 'No se encontraron prompts para esta variante.';
    } else {
      messageDiv.textContent = 'No hay prompts. ¡Añade uno!';
    }
    fragment.appendChild(messageDiv);
    container.appendChild(fragment); // Añadir el mensaje al DOM
    return;
  }

  filtered.forEach(p => {
    const div = document.createElement('div');
    div.className = 'prompt-item';
    div.dataset.id = p.id;

    // Botón de copiar (ahora con icono de portapapeles)
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-icon copy-btn';
    copyBtn.innerHTML = '📋'; // Icono de portapapeles
    copyBtn.title = 'Copiar como Markdown';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Evitar que se abra el modal al pulsar el botón
      copyPrompt(p.general);
    });
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = p.title;

    div.appendChild(copyBtn);
    div.appendChild(titleSpan); 

    div.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn-icon')) {
        openPromptModal(p.id);
      }
    });

    fragment.appendChild(div);
  });

  container.appendChild(fragment); // Añadir todos los elementos al DOM de una sola vez
}

// --- Funcionalidades de prompts ---
function copyPrompt(text) {
  // 'text' es el contenido HTML guardado. Lo convertimos a Markdown para copiar.
  const markdownToCopy = convertHTMLToMarkdown(text);
  navigator.clipboard.writeText(markdownToCopy).then(() => {
    showToast('Copiado como Markdown');
  }).catch(err => {
    console.error("Error al copiar: ", err);
    showToast('Error al copiar como Markdown: ' + err.message, true);
  });
}

function populateFolderSelect(selectElement, selectedFolderId) {
  selectElement.innerHTML = '<option value="">Sin carpeta</option>';
  const roots = buildFolderTree();

  function populateSelect(items, level = 0) {
    const fragment = document.createDocumentFragment();
    items.forEach(itemNode => {
      const opt = document.createElement('option');
      opt.value = itemNode.id;
      opt.textContent = '\u00A0'.repeat(level * 4) + itemNode.name;
      if (String(itemNode.id) === String(selectedFolderId)) opt.selected = true;
      fragment.appendChild(opt);

      if (itemNode.children.length > 0) {
        fragment.appendChild(populateSelect(itemNode.children, level + 1));
      }
    });
    return fragment;
  }

  selectElement.appendChild(populateSelect(roots));
}

async function openPromptModal(id = null, initialContent = null) {
  debugLog('=== INICIO openPromptModal ===');
  debugLog('Parámetros:', { id, hasInitialContent: !!initialContent });
  
  const isEdit = !!id;
  const item = isEdit ? data.prompts.find(p => p.id === id) : null;
  debugLog('Item encontrado:', item ? { id: item.id, title: item.title, contentLength: item.general?.length } : 'null');
  
  let currentVariants = isEdit ? [...item.variants] : [];

  // 1. Mostrar solo el formulario de prompts y ocultar los demás
  debugLog('Paso 1: Mostrando formulario de prompts');
  document.getElementById('prompt-form-fields').style.display = 'flex';
  document.getElementById('folder-form-fields').style.display = 'none';
  document.getElementById('variant-form-fields').style.display = 'none';

  // Deshabilitar campos de otros formularios para evitar errores de validación
  document.getElementById('folder-name').disabled = true;
  document.getElementById('variant-name').disabled = true;
  document.getElementById('prompt-title').disabled = false;

  // 2. Poblar los campos del formulario
  debugLog('Paso 2: Poblando campos del formulario');
  document.getElementById('edit-modal-title').textContent = isEdit ? 'Editar Prompt' : 'Nuevo Prompt';
  document.getElementById('edit-item-id').value = id || '';
  document.getElementById('prompt-title').value = item?.title || '';

  // Poblar select de carpetas
  const folderSelect = document.getElementById('prompt-folder');
  populateFolderSelect(folderSelect, item?.folderId);

  const variantSelect = document.getElementById('add-variant-select');
  const tagsContainer = document.getElementById('prompt-variants-container');

  function renderVariantTags() {
    tagsContainer.innerHTML = '';
    currentVariants.forEach(vId => {
        const variant = data.variants.find(v => v.id === vId);
        if (variant) {
            const tag = document.createElement('span');
            tag.className = 'variant-tag';
            tag.dataset.id = vId;
            tag.textContent = variant.name;
            tag.style.backgroundColor = VARIANT_COLORS[variant.id % VARIANT_COLORS.length];
            tag.style.color = '#FFFFFF';

            tag.addEventListener('click', () => {
                currentVariants = currentVariants.filter(id => id !== vId); // Usar !==
                renderVariantTags();
            });
            tagsContainer.appendChild(tag);
        }
    });

    variantSelect.innerHTML = '<option value="">Seleccionar variante...</option>';
    data.variants.forEach(v => {
        if (!currentVariants.includes(v.id)) {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            variantSelect.appendChild(opt);
        }
    });
  }

  renderVariantTags(); // Renderizar estado inicial

  const newSelect = variantSelect.cloneNode(true);
  variantSelect.parentNode.replaceChild(newSelect, variantSelect);
  newSelect.addEventListener('change', () => {
      const selectedId = parseInt(newSelect.value, 10);
      if (!isNaN(selectedId) && !currentVariants.includes(selectedId)) {
          currentVariants.push(selectedId);
          renderVariantTags();
      }
  });

  // 4. Cargar contenido en el editor Quill
  debugLog('Paso 4: Cargando contenido en Quill');
  try {
    if (!quillInstance) {
      console.error('ERROR: quillInstance es null o undefined');
      throw new Error("La instancia de Quill no se ha inicializado correctamente.");
    }
    debugLog('Quill instance OK:', !!quillInstance);

    const contentToInsert = initialContent ?? item?.general;
    debugLog('Contenido a insertar:', {
      source: initialContent ? 'initialContent' : 'item.general',
      length: contentToInsert?.length || 0,
      preview: contentToInsert?.substring(0, 100)
    });

    if (contentToInsert) {
      debugLog('Insertando contenido HTML directamente...');
      
      // Limpiar el editor primero
      quillInstance.setText('');
      
      // Insertar el HTML directamente
      quillInstance.clipboard.dangerouslyPasteHTML(0, contentToInsert);
      
      debugLog('Verificando contenido insertado...');
      const currentContent = quillInstance.root.innerHTML;
      debugLog('Contenido actual en Quill:', {
        length: currentContent.length,
        preview: currentContent.substring(0, 100)
      });
      
      debugLog('Contenido inicial cargado en el editor.');
    } else {
      debugLog('No hay contenido, limpiando editor');
      quillInstance.setText('');
    }

    if (initialContent && !item?.title) {
      document.getElementById('prompt-title').value = "Prompt desde texto seleccionado";
    }

    // 5. Mostrar el modal
    debugLog('Paso 5: Mostrando modal');
    document.getElementById('delete-item-btn').style.display = isEdit ? 'inline-block' : 'none';
    document.getElementById('copy-prompt-btn').style.display = 'inline-block';
    document.getElementById('edit-variables-btn').style.display = 'inline-block';
    document.getElementById('edit-modal').style.display = 'flex';
    debugLog('Modal mostrado, display:', document.getElementById('edit-modal').style.display);
    debugLog('=== FIN openPromptModal ===');
  } catch (error) {
    console.error('ERROR en openPromptModal:', error);
    showToast('Error al inicializar el editor: ' + error.message, true);
  }
}

// --- INICIO: Inicialización de Quill y configuración de pegado ---
async function initQuill() {
  return new Promise((resolve, reject) => {
    try {
      const container = document.querySelector('#quill-editor');
      if (!container) throw new Error('No se encontró el contenedor del editor #quill-editor');

      const editor = new Quill(container, {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline'],
            ['code', 'blockquote'],
            [{ 'list': 'bullet' }],
            ['link'],
            [{ 'color': [] }],
            ['code-block'],
          ],
        },
        placeholder: 'Escribe o pega tu contenido aquí...',
        bounds: container
      });

      editor.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
        if (delta.ops) {
          delta.ops.forEach(op => {
            if (op.attributes && op.attributes.background) {
              delete op.attributes.background;
            }
          });
        }
        return delta;
      });

      // Configurar layout del editor
      const editorContainer = container;
      const editorContent = container.querySelector('.ql-editor');
      if (editorContainer && editorContent) {
        editorContainer.style.flex = '1';
        editorContainer.style.height = 'auto';
        editorContainer.style.overflow = 'hidden';
        editorContainer.style.display = 'flex';
        editorContainer.style.flexDirection = 'column';
        editorContent.style.flex = '1';
        editorContent.style.overflow = 'auto';
        editorContent.style.height = 'auto';
      }
      resolve(editor);
    } catch (error) {
      console.error('Error al inicializar Quill:', error);
      reject(error);
    }
  });
}

function openFolderModal(id = null) {
  const isEdit = !!id;
  const item = isEdit ? data.folders.find(f => f.id === id) : null;

  // 1. Mostrar solo el formulario de carpetas y ocultar los demás
  document.getElementById('prompt-form-fields').style.display = 'none';
  document.getElementById('folder-form-fields').style.display = 'block';
  document.getElementById('variant-form-fields').style.display = 'none';

  // Deshabilitar campos de otros formularios para evitar errores de validación
  document.getElementById('prompt-title').disabled = true;
  document.getElementById('variant-name').disabled = true;
  document.getElementById('folder-name').disabled = false;

  // 2. Poblar los campos del formulario de forma segura
  document.getElementById('edit-modal-title').textContent = isEdit ? 'Editar Carpeta' : 'Nueva Carpeta';
  document.getElementById('edit-item-id').value = id || '';
  document.getElementById('folder-name').value = item?.name || '';

  const parentSelect = document.getElementById('folder-parent');
  parentSelect.innerHTML = '<option value="">Ninguna</option>'; // Limpiar opciones anteriores
  data.folders.forEach(f => {
    if (f.id !== id) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      if (item && String(f.id) === String(item.parentId)) opt.selected = true;
      parentSelect.appendChild(opt);
    }
  });

  // 3. Mostrar el modal
  document.getElementById('delete-item-btn').style.display = isEdit ? 'inline-block' : 'none';
  document.getElementById('copy-prompt-btn').style.display = 'none';
  document.getElementById('edit-modal').style.display = 'flex';
}

function openVariantModal(id = null) {
  const isEdit = !!id;
  const item = isEdit ? data.variants.find(v => String(v.id) === String(id)) : null;

  // 1. Mostrar solo el formulario de variantes y ocultar los demás
  document.getElementById('prompt-form-fields').style.display = 'none';
  document.getElementById('folder-form-fields').style.display = 'none';
  document.getElementById('variant-form-fields').style.display = 'block';

  // Deshabilitar campos de otros formularios para evitar errores de validación
  document.getElementById('prompt-title').disabled = true;
  document.getElementById('folder-name').disabled = true;
  document.getElementById('variant-name').disabled = false;

  // 2. Poblar los campos del formulario de forma segura
  document.getElementById('edit-modal-title').textContent = isEdit ? 'Editar Variante' : 'Nueva Variante';
  document.getElementById('edit-item-id').value = id || '';
  document.getElementById('variant-name').value = item?.name || '';
  document.getElementById('variant-url').value = item?.url || '';

  // 3. Mostrar el modal
  document.getElementById('delete-item-btn').style.display = isEdit ? 'inline-block' : 'none';
  document.getElementById('copy-prompt-btn').style.display = 'none';
  document.getElementById('edit-modal').style.display = 'flex';
}

function copyPromptFromEditor() {
  if (!quillInstance) {
    showToast('Error: Editor no disponible', true);
    return;
  }
  const htmlContent = quillInstance.root.innerHTML;
  const markdownToCopy = convertHTMLToMarkdown(htmlContent);
  navigator.clipboard.writeText(markdownToCopy).then(() => {
    showToast('Copiado como Markdown');
  }).catch(err => {
    console.error("Error al copiar: ", err);
    showToast('Error al copiar como Markdown: ' + err.message, true);
  });
}

async function saveModalForm() {
  debugLog('Iniciando guardado del formulario...');
  // Obtener el ID del input correcto, que ahora siempre está presente en el cuerpo del modal.
  const id = document.getElementById('edit-item-id')?.value || null;
  
  // Validación básica
  const isPrompt = document.getElementById('prompt-form-fields').style.display === 'flex';
  const isFolder = document.getElementById('folder-form-fields').style.display === 'block';
  const isVariant = document.getElementById('variant-form-fields').style.display === 'block';
  
  if (isPrompt && !document.getElementById('prompt-title').value.trim()) {
    showToast('El título del prompt es obligatorio', true);
    return;
  }
  if (isFolder && !document.getElementById('folder-name').value.trim()) {
    showToast('El nombre de la carpeta es obligatorio', true);
    return;
  }
  if (isVariant && !document.getElementById('variant-name').value.trim()) {
    showToast('El nombre de la variante es obligatorio', true);
    return;
  }


  if (isPrompt) {
    let htmlContent = '<p><br></p>'; // Contenido por defecto si el editor está vacío
    if (quillInstance) {
      htmlContent = quillInstance.root.innerHTML;
    } else {
      showToast('Error: No se encontró la instancia del editor.', true);
      return; // No guardar si no hay editor
    }

    const title = document.getElementById('prompt-title').value;
    const folderId = document.getElementById('prompt-folder').value || null;
    const currentVariants = Array.from(document.querySelectorAll('#prompt-variants-container .variant-tag')).map(tag => parseInt(tag.dataset.id, 10));

    if (id) { // Editar
      const index = data.prompts.findIndex(p => String(p.id) === String(id));
      if (index !== -1) {
        data.prompts[index] = { ...data.prompts[index], title, folderId, general: htmlContent, variants: currentVariants };
      }
    } else {
      data.prompts.push({
        id: generateId('p'),
        title,
        folderId,
        general: htmlContent,
        variants: currentVariants
      });
    }
  } else if (isFolder) {
    const name = document.getElementById('folder-name').value;
    const parentId = document.getElementById('folder-parent').value || null;

    if (id) {
      const index = data.folders.findIndex(f => String(f.id) === String(id));
      if (index !== -1) {
        data.folders[index] = { ...data.folders[index], name, parentId };
      }
    } else {
      data.folders.push({
        id: generateId('f'),
        name,
        parentId
      });
    }
  } else if (isVariant) {
    const name = document.getElementById('variant-name').value;
    const url = document.getElementById('variant-url').value || null;

    if (id) {
      const index = data.variants.findIndex(v => String(v.id) === String(id));
      if (index !== -1) {
        data.variants[index] = { ...data.variants[index], name, url };
      }
    } else {
      const nextId = data.variants.length > 0 ? Math.max(...data.variants.map(v => v.id)) + 1 : 1;
      if (nextId > 255) {
        showToast('Máximo de variantes alcanzado (255)', true);
        document.getElementById('edit-modal').style.display = 'none';
        return;
      }
      data.variants.push({
        id: nextId,
        name,
        url
      });
    }
  }

  saveToStorage(); // Guardar después de la modificación
  invalidateFolderTreeCache(); // Invalidar caché de carpetas
  renderFolders();
  renderVariants();
  renderFolderFilter();
  renderVariantFilter();
  renderPrompts();
  document.getElementById('edit-modal').style.display = 'none';
  showToast('Guardado correctamente');
}

async function deleteCurrentItem() {
  // Obtener el ID de la misma manera segura que en saveModalForm
  const id = document.getElementById('edit-item-id')?.value || null;
  if (!id) {
    showToast('No se pudo encontrar el item a eliminar.', true);
    return;
  }

  const isPrompt = data.prompts.some(p => String(p.id) === String(id));
  const isFolder = data.folders.some(f => String(f.id) === String(id));
  const isVariant = data.variants.some(v => String(v.id) === String(id));

  if (isPrompt) {
    data.prompts = data.prompts.filter(p => String(p.id) !== String(id));
    showToast('Prompt eliminado');
  } else if (isFolder) {
    data.folders = data.folders.filter(f => String(f.id) !== String(id));
    invalidateFolderTreeCache(); // Invalidar caché de carpetas
    showToast('Carpeta eliminada');
  } else if (isVariant) {
    data.variants = data.variants.filter(v => String(v.id) !== String(id));
    showToast('Variante eliminada');
  }

  saveToStorage(); // Guardar después de la eliminación
  renderFolders();
  renderVariants();
  renderFolderFilter();
  renderVariantFilter();
  renderPrompts();
  document.getElementById('edit-modal').style.display = 'none';
}

// --- Importar / Exportar ---
function exportData() {
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'promptsync_data.json';
  link.click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      
      // Sanitizar los datos importados
      const sanitizedData = {
        prompts: (imported.prompts || []).map(p => ({
          ...p,
          title: sanitizeString(p.title),
          general: sanitizeHTML(p.general),
          variants: Array.isArray(p.variants) ? p.variants.map(v => parseInt(v, 10)).filter(Number.isFinite) : []
        })),
        folders: (imported.folders || []).map(f => ({
          ...f,
          name: sanitizeString(f.name)
        })),
        variants: (imported.variants || []).map(v => ({
          ...v,
          name: sanitizeString(v.name),
          url: isValidHttpUrl(v.url) ? v.url : null // Solo aceptar URLs válidas
        }))
      };

      if (sanitizedData) {
        data = sanitizedData;
        invalidateFolderTreeCache();
        saveToStorage();
        renderFolders();
        renderVariants();
        renderFolderFilter();
        renderVariantFilter();
        renderPrompts();
        showToast('Datos importados correctamente');
      } else {
        showToast('Archivo inválido', true);
      }
    } catch (e) {
      showToast('Error al leer el archivo', true);
    }
  };
  reader.readAsText(file);
}

// --- Limpieza ---
async function cleanOrphans() {
  const folderIds = new Set(data.folders.map(f => f.id));
  const variantIds = new Set(data.variants.map(v => v.id));

  const initialPromptsCount = data.prompts.length;
  const initialFoldersCount = data.folders.length;

  data.prompts = data.prompts.filter(p => !p.folderId || folderIds.has(p.folderId));
  const foldersOriginal = [...data.folders];
  data.folders = foldersOriginal.filter(f => !f.parentId || folderIds.has(f.parentId));

  data.prompts.forEach(p => {
    p.variants = p.variants.filter(vId => variantIds.has(vId));
  });
  invalidateFolderTreeCache();
  await saveToStorage(); // Guardar después de la limpieza
  renderFolders();
  renderVariants();
  renderFolderFilter();
  renderVariantFilter();
  renderPrompts();

  const removedPrompts = initialPromptsCount - data.prompts.length;
  const removedFolders = initialFoldersCount - data.folders.length;

  showToast(`Limpieza completada. Eliminados: ${removedPrompts} prompts huérfanos, ${removedFolders} carpetas huérfanas.`);
}

// --- Eventos de UI (mantiene la lógica anterior, adaptada para asincronía si es necesario) ---
document.getElementById('open-config').addEventListener('click', async () => {
  document.getElementById('config-modal').style.display = 'flex';
  document.getElementById('theme-select').value = config.theme;
  renderFolders();
  renderVariants();
});

document.getElementById('add-prompt-btn').addEventListener('click', () => {
    openPromptModal(); // Abre el modal para crear un nuevo prompt
});

document.getElementById('export-btn').addEventListener('click', exportData);
document.getElementById('import-btn').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('load-defaults-btn').addEventListener('click', async () => {
  if (data.prompts.length > 0 || data.folders.length > 0 || data.variants.length > 0) {
    const confirmLoad = confirm(
      "¿Estás seguro de que quieres cargar los datos de ejemplo?\n\n" +
      "Esto reemplazará todos los datos existentes."
    );
    if (!confirmLoad) return;
  }
  
  try {
    console.log("Cargando datos de ejemplo desde botón...");
    const success = await loadDefaultDataFromFile();
    if (success) {
      document.getElementById('config-modal').style.display = 'none';
    }
  } catch (error) {
    console.error("Error al cargar datos de ejemplo:", error);
    showToast("Error al cargar datos de ejemplo: " + error.message, true);
  }
});
document.getElementById('clean-btn').addEventListener('click', cleanOrphans);
document.getElementById('add-folder-btn-config').addEventListener('click', () => openFolderModal());
document.getElementById('add-variant-btn-config').addEventListener('click', () => openVariantModal());

// Debouncing para búsqueda
let searchTimeout;
document.getElementById('search-input').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderPrompts, 300);
});
document.getElementById('folder-filter').addEventListener('change', renderPrompts);

// --- Evento para el filtro de variante ---
document.getElementById('variant-filter').addEventListener('change', function() {
  const selectedValue = this.value;  
  const variant = data.variants.find(v => String(v.id) === selectedValue);

  // Manejar el botón de URL
  const urlBtn = document.getElementById('open-variant-url');
  if (variant && variant.url) {
    urlBtn.style.display = 'inline-block'; // Asegurarse de que el botón sea visible
    urlBtn.onclick = () => {
      if (isValidHttpUrl(variant.url)) {
        window.open(variant.url, '_blank');
      } else {
        showToast(`URL no válida o insegura: ${variant.url}`, true);
      }
    };
  } else {
    urlBtn.style.display = 'none';
  }

  // Aplicar el filtro
  renderPrompts();
});

// Eventos del modal de configuración
document.getElementById('theme-select').addEventListener('change', async function() {
  config.theme = this.value;
  applyTheme(config.theme);
  await saveConfigToStorage(); // Guardar la configuración
});

// Eventos modales
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
});
document.getElementById('close-config-modal').addEventListener('click', () => document.getElementById('config-modal').style.display = 'none');
document.getElementById('close-edit-modal').addEventListener('click', () => document.getElementById('edit-modal').style.display = 'none');
document.getElementById('cancel-edit-modal').addEventListener('click', () => document.getElementById('edit-modal').style.display = 'none');

// Manejar el guardado a través del evento 'submit' del formulario
document.getElementById('edit-modal').addEventListener('submit', (e) => {
  e.preventDefault(); // Prevenir el comportamiento por defecto del formulario
  saveModalForm();
});

document.getElementById('delete-item-btn').addEventListener('click', deleteCurrentItem);
document.getElementById('copy-prompt-btn').addEventListener('click', copyPromptFromEditor);
document.getElementById('edit-variables-btn').addEventListener('click', () => {
  if (!quillInstance) {
    showToast('Error: Editor no disponible', true);
    return;
  }
  // Obtener contenido del editor Quill como texto plano
  const htmlContent = quillInstance.root.innerHTML;
  const textContent = quillInstance.getText();
  
  // Transferir al editor de variables
  document.getElementById('variable-base-prompt').value = textContent;
  
  // Cerrar modal actual y abrir editor de variables
  document.getElementById('edit-modal').style.display = 'none';
  openVariableEditor();
  
  // Inicializar con el contenido transferido
  const vars = parseVariableEditorVariables(textContent);
  renderVariableForm(vars);
});

// --- Inicialización ---
async function init() {
  debugLog("=== INICIO DE INICIALIZACIÓN ===");

  try {
    if (!window.Quill || !window.TurndownService || !window.marked) {
      throw new Error("Dependencias principales (Quill, Turndown) no cargadas correctamente");
    }
    debugLog("✓ Dependencias verificadas");

    debugLog("Cargando configuración...");
    await loadConfigFromStorage();
    applyTheme();
    debugLog("✓ Configuración cargada");

    debugLog("Cargando datos desde storage...");
    await loadFromStorage();
    
    if (!data || typeof data !== 'object') {
      console.error("Datos inválidos después de loadFromStorage");
      data = { prompts: [], folders: [], variants: [] };
      await saveToStorage();
    }
    
    data.prompts = Array.isArray(data.prompts) ? data.prompts : [];
    data.folders = Array.isArray(data.folders) ? data.folders : [];
    data.variants = Array.isArray(data.variants) ? data.variants : [];
    debugLog("✓ Estructura de datos verificada");

    // Inicializar Quill ANTES de renderizar
    debugLog("Inicializando editor Quill...");
    try {
      quillInstance = await initQuill();
      debugLog('✓ Editor Quill inicializado y listo para ser usado.');
    } catch (quillError) {
      console.error("Error crítico al inicializar Quill:", quillError);
      showToast("No se pudo inicializar el editor de texto: " + quillError.message, true);
    }

    debugLog("Renderizando interfaz...");
    try {
      renderFolders();
      renderVariants();
      renderFolderFilter();
      renderVariantFilter();
      renderPrompts();
      debugLog("✓ Interfaz renderizada");
    } catch (renderError) {
      console.error("Error durante el renderizado:", renderError);
      showToast("Error al renderizar la interfaz: " + renderError.message, true);
    }

    debugLog("=== INICIALIZACIÓN COMPLETADA ===");

  } catch (error) {
    console.error("Error crítico durante la inicialización:", error);
    showToast("Error durante la inicialización: " + error.message, true);
    
    data = {
      prompts: [],
      folders: [],
      variants: []
    };
    
    try {
      renderFolders();
      renderVariants();
      renderFolderFilter();
      renderVariantFilter();
      renderPrompts();
    } catch (renderError) {
      console.error("Error durante la recuperación:", renderError);
    }
  }
}

// Listener para mensajes (deshabilitado para versión web)
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === 'textForNewPrompt' && message.text) {
//     debugLog('Recibido texto para nuevo prompt. Abriendo modal...');
//     openPromptModal(null, message.text);
//   }
// });

// --- Input de archivo ---
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.id = 'file-input';
fileInput.accept = '.json';
fileInput.style.display = 'none';
fileInput.addEventListener('change', importData);
document.body.appendChild(fileInput);

// --- Navegación por teclado ---
document.addEventListener('keydown', (e) => {
  // Ctrl+N para nuevo prompt
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    openPromptModal();
  }
  // Escape para cerrar modales
  if (e.key === 'Escape') {
    document.getElementById('config-modal').style.display = 'none';
    document.getElementById('edit-modal').style.display = 'none';
  }
});

// --- Iniciar la aplicación ---
function checkDependencies() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts++;      
      debugLog(`Verificando dependencias (intento ${attempts}/${maxAttempts})...`);
      
      if (window.Quill && window.TurndownService && window.marked) {
        clearInterval(interval);
        debugLog("✓ Todas las dependencias están disponibles");
        resolve();
      } else {
        debugLog("Estado de dependencias:", {
          marked: !!window.marked,
          Quill: !!window.Quill,
          TurndownService: !!window.TurndownService,
        });
        
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error("Tiempo de espera agotado al cargar dependencias"));
        }
      }
    }, 100);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  debugLog("=== COMENZANDO CARGA DE APLICACIÓN ===");
  
  try {
    await checkDependencies();

    debugLog("Iniciando aplicación...");
    await init();
    debugLog("=== APLICACIÓN INICIALIZADA CON ÉXITO ===");
    
  } catch (error) {
    console.error("Error fatal durante la inicialización:", {
      mensaje: error.message,
      nombre: error.name,
      stack: error.stack
    });
    
    showToast("Error crítico al inicializar: " + error.message, true);
    data = {
      prompts: [],
      folders: [],
      variants: []
    };
    
    try {
      renderFolders();
      renderVariants();
      renderFolderFilter();
      renderVariantFilter();
      renderPrompts();
    } catch (renderError) {
      console.error("Error durante la recuperación de emergencia:", renderError);
    }
  }
});

// --- Editor PFM ---
let currentPFM = null;
const pfmFileInput = document.getElementById('pfm-file-input');

function openVariableEditor() {
  document.getElementById('variable-editor-modal').style.display = 'flex';
  // Si hay contenido en el editor Quill, intentar convertirlo a PFM básico
  if (quillInstance) {
    const content = quillInstance.getText().trim();
    if (content) {
      document.getElementById('pfm-template-area').value = content;
    }
  }
}

function validatePFM(data) {
  const errors = [];
  if (!data.manifest_version || data.manifest_version !== "1.0") errors.push("manifest_version debe ser '1.0'");
  if (!data.type || !["image_prompt", "text_prompt", "video_prompt"].includes(data.type)) errors.push("type inválido");
  if (!data.name || typeof data.name !== 'string') errors.push("name requerido");
  if (!data.language || typeof data.language !== 'string') errors.push("language requerido");
  if (!data.template || typeof data.template !== 'string') errors.push("template requerido");
  if (!data.variables || typeof data.variables !== 'object') errors.push("variables requerido");
  return errors;
}

function loadPFM(data) {
  const errors = validatePFM(data);
  if (errors.length > 0) {
    showToast('Errores en PFM: ' + errors.join(', '), true);
    return;
  }
  
  currentPFM = data;
  document.getElementById('pfm-prompt-name').textContent = data.name;
  document.getElementById('pfm-prompt-type').textContent = data.type;
  document.getElementById('pfm-prompt-lang').textContent = data.language;
  document.getElementById('pfm-prompt-info').style.display = 'block';
  document.getElementById('pfm-template-area').value = data.template;
  
  renderPFMVariableForm(data.variables);
  
  if (data.negative_prompt) {
    document.getElementById('pfm-negative-text').textContent = data.negative_prompt;
    document.getElementById('pfm-negative-prompt').style.display = 'block';
    document.getElementById('pfm-copy-neg-btn').style.display = 'inline-block';
    document.getElementById('pfm-copy-both-btn').style.display = 'inline-block';
  } else {
    document.getElementById('pfm-negative-prompt').style.display = 'none';
    document.getElementById('pfm-copy-neg-btn').style.display = 'none';
    document.getElementById('pfm-copy-both-btn').style.display = 'none';
  }
}

function renderPFMVariableForm(variables) {
  const container = document.getElementById('pfm-form-container');
  container.innerHTML = '';
  
  if (Object.keys(variables).length === 0) {
    container.innerHTML = '<p>No hay variables configurables.</p>';
    return;
  }
  
  Object.entries(variables).forEach(([key, variable]) => {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    const label = document.createElement('label');
    label.textContent = variable.label;
    label.htmlFor = `pfm-var-${key}`;
    
    let inputEl;
    if (variable.type === 'boolean') {
      inputEl = document.createElement('select');
      inputEl.innerHTML = '<option value="true">Sí</option><option value="false">No</option>';
      inputEl.value = variable.default ? 'true' : 'false';
    } else if (variable.type === 'select') {
      inputEl = document.createElement('select');
      variable.options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (option === variable.default) opt.selected = true;
        inputEl.appendChild(opt);
      });
    } else if (variable.type === 'number') {
      inputEl = document.createElement('input');
      inputEl.type = 'number';
      inputEl.value = variable.default || 0;
    } else {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.value = variable.default || '';
    }
    
    inputEl.id = `pfm-var-${key}`;
    inputEl.dataset.varKey = key;
    
    formGroup.appendChild(label);
    formGroup.appendChild(inputEl);
    container.appendChild(formGroup);
  });
}

function generatePFMFinalPrompt() {
  if (!currentPFM) {
    showToast('Primero carga un archivo PFM', true);
    return;
  }
  
  let finalPrompt = document.getElementById('pfm-template-area').value || currentPFM.template;
  
  Object.keys(currentPFM.variables).forEach(key => {
    const input = document.getElementById(`pfm-var-${key}`);
    if (input) {
      let value = input.value;
      if (currentPFM.variables[key].type === 'boolean') {
        value = value === 'true' ? 'sí' : 'no';
      }
      finalPrompt = finalPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  });
  
  return finalPrompt;
}

// Event Listeners para Editor PFM
document.getElementById('variable-editor-btn').addEventListener('click', openVariableEditor);
document.getElementById('close-variable-modal').addEventListener('click', () => {
  document.getElementById('variable-editor-modal').style.display = 'none';
});

document.getElementById('pfm-load-btn').addEventListener('click', () => pfmFileInput.click());

pfmFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      loadPFM(data);
    } catch (error) {
      showToast('Error al leer JSON: ' + error.message, true);
    }
  };
  reader.readAsText(file);
});

document.getElementById('pfm-paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text);
    loadPFM(data);
  } catch (error) {
    showToast('Error al pegar JSON: ' + error.message, true);
  }
});

document.querySelectorAll('.variable-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    document.querySelectorAll('.variable-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.variable-tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`pfm-${targetTab}-tab`).classList.add('active');
  });
});

document.getElementById('pfm-generate-btn').addEventListener('click', () => {
  const final = generatePFMFinalPrompt();
  if (final) {
    document.getElementById('pfm-output').value = final;
    document.querySelectorAll('.variable-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.variable-tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('[data-tab="final"]').classList.add('active');
    document.getElementById('pfm-final-tab').classList.add('active');
  }
});

document.getElementById('pfm-copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('pfm-output').value).then(() => {
    showToast('Prompt copiado al portapapeles');
  });
});

document.getElementById('pfm-copy-neg-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('pfm-negative-text').textContent).then(() => {
    showToast('Prompt negativo copiado');
  });
});

document.getElementById('pfm-copy-both-btn').addEventListener('click', () => {
  const positive = document.getElementById('pfm-output').value.trim();
  const negative = document.getElementById('pfm-negative-text').textContent.trim();
  const combined = `${positive}.\n\nEvitar absolutamente: ${negative}`;
  navigator.clipboard.writeText(combined).then(() => {
    showToast('Ambos prompts copiados');
  });
});

// --- Escuchar cambios en la preferencia del sistema para el tema ---
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (config.theme === 'auto') {
          applyTheme('auto');
      }
  });
}