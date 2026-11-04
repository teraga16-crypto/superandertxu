# SUPERANDERTXU: guía de puesta en marcha

Son unos 20 minutos y solo hay que hacerlo una vez. Mejor desde un ordenador.

---

## Paso 1 · Crear la base de datos (Firebase, gratis)

1. Entra en **https://console.firebase.google.com** con tu cuenta de Google.
2. **Crear un proyecto** → nombre: `superandertxu` → desactiva Google Analytics → **Crear**.
3. Menú izquierdo → **Compilación → Authentication** → **Comenzar** → pestaña *Método de acceso* → **Correo electrónico/contraseña** → actívalo (solo el primer interruptor) → **Guardar**.
4. Menú izquierdo → **Compilación → Firestore Database** → **Crear base de datos**:
   - Ubicación: `eur3 (europe-west)`
   - Empieza en **modo de producción** → **Crear**.
5. Dentro de Firestore, pestaña **Reglas**. Borra lo que haya, pega esto y pulsa **Publicar**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null
           && request.auth.token.email == 'familia@superandertxu.app';
       }
     }
   }
   ```

6. Arriba a la izquierda, ⚙️ → **Configuración del proyecto** → abajo, en *Tus apps*, pulsa el icono **`</>`** (Web) → apodo `superandertxu` → **Registrar app** (no marques Hosting).
7. Aparece un bloque `const firebaseConfig = { apiKey: ..., ... }`. **Cópialo y envíamelo** (no es secreto, puedes pegarlo en el chat).

## Paso 2 · Publicar la app (GitHub, gratis)

1. En **https://github.com/new** crea un repositorio:
   - Nombre: `superandertxu`
   - **Public** (necesario para que sea gratis)
   - No marques nada más → **Create repository**.
2. Dime tu usuario de GitHub y yo subo el código.
3. Cuando esté subido: en el repositorio, **Settings → Pages** → *Branch*: `main`, carpeta `/ (root)` → **Save**.
   Al cabo de 1 o 2 minutos tendrás la dirección: `https://TU-USUARIO.github.io/superandertxu/`

## Paso 3 · Instalarla en los iPhone

1. Abre la dirección en **Safari** (tiene que ser Safari).
2. Botón **Compartir** (□↑) → **Añadir a pantalla de inicio** → **Añadir**.
3. Abre la app desde el icono nuevo.
4. Escribe un **PIN de al menos 6 números**. *La primera vez que alguien entra, ese PIN se convierte en el PIN familiar.* Pásaselo a tu pareja y a quien quieras (abuelos, etc.).
5. ⚙️ **Ajustes**:
   - Cambia los nombres de “Yo”, “Pareja” y “Bebé” por los vuestros (y el emoji o color si queréis).
   - En **Este dispositivo es de**, elige quién eres.
   - Pulsa **Activar avisos** y acepta el permiso.

Cada persona repite el paso 3 en su iPhone.

## Paso 4 · Activar el envío de avisos

1. En el repositorio de GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FAMILY_PIN`
   - Secret: vuestro PIN familiar
   - **Add secret**
2. Pestaña **Actions** → si aparece un botón verde para habilitar los workflows, púlsalo.
3. Para probar: **Actions → Avisos → Run workflow**. Si sale ✅ verde, todo está bien.

A partir de ahí, GitHub revisa cada 10 minutos si hay que mandar algún aviso.

---

## Cómo se usa

- **＋** para añadir. Solo son obligatorios el **título** y la **fecha**.
- **Evento** (cita, turno de trabajo, guardería…) o **Tarea / obligación** (pagar algo, comprar pañales…). Las tareas tienen un círculo para marcarlas como hechas, y si no se hacen siguen apareciendo arriba en rojo.
- **¿De quién es? / ¿Quién se encarga?**: elige una persona, varias o ninguna. Cada persona tiene su color en la barra lateral; lo que no tiene responsable aparece con raya discontinua y la etiqueta **Sin asignar**.
- **Otra persona**: añade a abuelos, tíos, canguro…
- **Repetir**: cada día, semana (eligiendo los días, p. ej. L-V para el trabajo), mes o año, con fecha de fin opcional. Al editar o borrar algo que se repite, la app pregunta si es *solo ese día* o *toda la serie*.
- **Filtros** arriba: toca una o varias personas, o “Sin asignar”.
- Si el turno acaba más tarde que empieza (p. ej. 22:00 a 06:00), se entiende que termina al día siguiente.

## Bueno saber

- **Los avisos pueden llegar con unos minutos de retraso** (GitHub a veces se retrasa entre 5 y 15 minutos). Para algo crítico, usa “15 min antes” o más.
- Si una actividad es solo del bebé o de alguien sin iPhone, el aviso llega a todos.
- La zona horaria es la de **España peninsular**. Si es otra, dímelo.
- Si cambiáis el PIN (Ajustes → Cambiar PIN), actualizad también el secreto `FAMILY_PIN` en GitHub.
- Todo es gratis: Firebase da de sobra para una familia y GitHub no cobra por proyectos públicos. El código es público, pero **los datos no**: solo se ven con el PIN.
