(function(window, document, $){
   var idTextarea = 'editor1'
    , textarea
    , $textarea
    , editor
    , lastData
    , timeoutAcumulacion
    , banderaTimeoutAcumulacion = false
    , banderaAcumulacion = false
    , msTimeoutAcumulacion = 500
    , checksumUltimoRequestSnapshot
    , ultimoChecksumRecibido
    , MyApp = {
        patchEditor: function(patchesStr, checksumEstado){
          if(!editor) {
            editor = CKEDITOR.instances[idTextarea];
          }
          if(!editor) {
            return;
          }
          var data = editor.getData();
          // revisamos si estamos en el estado sobre el cual
          // se puede aplicar el parche
          if(MD5(data) !== checksumEstado) {
            // no estamos en el estado sobre el cual se creó
            // debemos pedir un nuevo "snapshot" del estado

            // para debugear
            console.log('checksum estado no corresponde');

            fireTogetherJSEditorSnapshotRequest(checksumEstado);
            return;
          }
          lastData = diffMatchPatch.patch_apply(
              diffMatchPatch.patch_fromText(patchesStr)
              , editor.getData()
            )[0]
          ;
          editor.setData(lastData);
        }
      }
    , diffMatchPatch = new diff_match_patch()
    , originalData
    , editorChangeFromRemote = false
    , locateTextarea = function() {
        var elementFinder = TogetherJS.require("elementFinder");
        return elementFinder.elementLocation(textarea);
      }
    , fireTogetherJSEditorChange = function(ev, patchesStr, checksumEstado) {
      if(editorChangeFromRemote || !patchesStr.length || !textarea) {
        return;
      }
      var location = locateTextarea();
      TogetherJS.send({type: "editorChange", patchesStr: patchesStr, checksumEstado: checksumEstado, element: location});
    }
    , fireTogetherJSEditorSnapshotRequest = function(checksumEstado) {
      var location = locateTextarea();
      // el checksum lo mandamos para poder ignorar respuestas duplicadas y respuestas
      // a solicitudes que no son propias
      checksumUltimoRequestSnapshot = checksumEstado;
      TogetherJS.send({type: "snapshotRequest", checksumEstado: checksumEstado, element: location});
    }
  ;

  TogetherJSConfig_on_ready = function () {
    $('body').on("patchReady", fireTogetherJSEditorChange);
  };
  TogetherJSConfig_on_close = function () {
    $('body').off("patchReady", fireTogetherJSEditorChange);
  };

  $(function(){
    textarea = document.getElementById(idTextarea);
    $textarea = $(textarea);

    TogetherJS.hub.on("editorChange", function (msg) {
      // if (! msg.sameUrl) {
      //   return;
      // }
      editorChangeFromRemote = true;
      try {
        MyApp.patchEditor(msg.patchesStr, msg.checksumEstado);
      } finally {
        editorChangeFromRemote = false;
      }
    });

    TogetherJS.hub.on("snapshotRequest", function (msg) {
      if(!editor) {
        return;
      }
      var location = locateTextarea();
      TogetherJS.send({type: "snapshotResponse", snapshot: editor.getData(), checksumEstado: msg.checksumEstado, element: location});
    });

    TogetherJS.hub.on("snapshotResponse", function (msg) {
      // si no es el snapshot del request que hicimos o simplemente no hemos hecho un request
      // de snapshot no continuamos
      if(!editor || !checksumUltimoRequestSnapshot || checksumUltimoRequestSnapshot !== msg.checksumEstado) {
        return;
      }
      checksumUltimoRequestSnapshot = undefined;
      editor.setData(msg.snapshot);
    });

    TogetherJS.hub.on("togetherjs.hello", function (msg) {
      // if (! msg.sameUrl) {
      //   return;
      // }
      var helloSync = function() {
        var patchesStr = diffMatchPatch.patch_toText(diffMatchPatch.patch_make(originalData, editor.getData()));
        fireTogetherJSEditorChange({}, patchesStr, MD5(originalData));
      }
      if(originalData && editor) {
        helloSync();
      } else {
        // el editor todavía no está listo, así que esperaremos
        $('body').on('editorListo', helloSync)
      }
    });

    CKEDITOR.on('instanceReady', function(){
      editor = CKEDITOR.instances[idTextarea];
      lastData = originalData = editor.getData();
      editor.on('change', function(){
        var reportarCambio = function() {
            var data = editor.getData()
              , patchesStr = diffMatchPatch.patch_toText(diffMatchPatch.patch_make(lastData,data));
            ;

            // disparamos un evento para dar aviso de que tenemos el parche listo
            // NOTA: el MD5 es un checksum que usaremos para que los otros extremos
            // verifiquen si tienen el estado correcto de los datos antes de aplicar
            // el parche. Si no lo tienen, deben pedir un snapshot del estado
            $textarea.trigger('patchReady',[patchesStr, MD5(lastData)]);

            lastData = data;
          }
          //, timeO = new Date().getTime() // para debugging de acumulación
          , handlerAcumulacion = function(){
            // para debugging de acumulacion
            // console.log('acumulacion ' + (new Date().getTime() - timeO));

            // había alguna solicitud de reportar cambio en cola?
            if(banderaAcumulacion) {
              // si
              // así que reportamos
              reportarCambio();

              // acabamos de reportar un cambio, así que tenemos que levantar el
              // timeout de nuevo
              timeoutAcumulacion = window.setTimeout(handlerAcumulacion, msTimeoutAcumulacion);

              // y reseteamos la bandera
              banderaAcumulacion = false;
            } else {
              banderaTimeoutAcumulacion = false;
            }
          }
        ;

        // si está activo el timeout de acumulación de cambios, entonces tenemos que dejar
        // "en cola" la solicitud de reportar un cambio, para cuando se haya cumplido el
        // timeout
        if(banderaTimeoutAcumulacion){
          banderaAcumulacion = true;
          return;
        }

        reportarCambio();

        // los siguientes cambios que ocurran los acumularemos
        banderaTimeoutAcumulacion = true;
        timeoutAcumulacion = window.setTimeout(handlerAcumulacion, msTimeoutAcumulacion);
      });
      $textarea.trigger('editorListo');
    });
  });
}(window, document, jQuery));