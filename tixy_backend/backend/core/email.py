"""
Servicio de envío de correos usando Resend.
Documentación: https://resend.com/docs/send-with-python
"""
import resend
from core.config import settings

# Configurar API key al importar el módulo
resend.api_key = settings.RESEND_API_KEY


def send_password_reset_email(to_email: str, to_name: str, reset_link: str) -> None:
    """
    Envía el correo de recuperación de contraseña con el link de reset.
    Lanza una excepción si el envío falla.
    """
    nombre = to_name.split()[0] if to_name else "Usuario"

    html_body = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#1A0D14;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A0D14;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0"
                   style="background:#2a1220;border:1px solid #5a1535;border-radius:16px;overflow:hidden;">

              <!-- Encabezado -->
              <tr>
                <td align="center" style="padding:32px 40px 24px;background:#1A0D14;
                           border-bottom:1px solid #5a1535;">
                  <span style="font-size:22px;font-weight:700;letter-spacing:6px;
                               text-transform:uppercase;color:#C0206A;">TIXY</span>
                  <span style="font-size:22px;font-weight:300;letter-spacing:6px;
                               text-transform:uppercase;color:#ffffff66;"> GLAMOUR</span>
                  <div style="margin-top:6px;font-size:10px;letter-spacing:4px;
                              text-transform:uppercase;color:#ffffff30;">
                    Sistema de Pedidos
                  </div>
                </td>
              </tr>

              <!-- Cuerpo -->
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#ffffff;">
                    Hola, {nombre} 👋
                  </p>
                  <p style="margin:0 0 24px;font-size:14px;color:#ffffff99;line-height:1.6;">
                    Recibimos una solicitud para restablecer la contraseña de tu cuenta en
                    <strong style="color:#FAE0EE;">Tixy Glamour</strong>.
                    Haz clic en el botón para crear una contraseña nueva.
                  </p>

                  <!-- Botón CTA -->
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" style="padding:8px 0 28px;">
                        <a href="{reset_link}"
                           style="display:inline-block;padding:14px 36px;
                                  background:#C0206A;color:#ffffff;
                                  font-size:14px;font-weight:700;letter-spacing:1px;
                                  text-decoration:none;border-radius:10px;
                                  text-transform:uppercase;">
                          Restablecer contraseña →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0 0 8px;font-size:12px;color:#ffffff50;line-height:1.6;">
                    Este enlace es válido por <strong style="color:#FAE0EE;">1 hora</strong>.
                    Si no solicitaste este cambio, ignora este correo y tu contraseña no será modificada.
                  </p>

                  <!-- Link alternativo -->
                  <div style="margin-top:20px;padding:16px;background:#1A0D14;
                              border-radius:8px;border:1px solid #5a1535;">
                    <p style="margin:0 0 6px;font-size:11px;color:#ffffff40;
                               text-transform:uppercase;letter-spacing:2px;">
                      Si el botón no funciona, copia este enlace:
                    </p>
                    <p style="margin:0;font-size:11px;color:#C0206A;word-break:break-all;">
                      {reset_link}
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Pie -->
              <tr>
                <td align="center"
                    style="padding:20px 40px;border-top:1px solid #5a1535;
                           font-size:11px;color:#ffffff25;letter-spacing:2px;">
                  TIXY GLAMOUR © 2026 — Este es un mensaje automático, no respondas este correo.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    resend.Emails.send({
        "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
        "to": [to_email],
        "subject": "Restablecer contraseña — Tixy Glamour",
        "html": html_body,
    })


def send_order_pdf_email(to_email: str, client_name: str, order_number: str, pdf_bytes: bytes) -> None:
    """
    Envía la orden de pedido en PDF al correo del cliente.
    """
    import base64
    nombre = client_name.split()[0] if client_name else "Cliente"

    html_body = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#1A0D14;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A0D14;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0"
                   style="background:#2a1220;border:1px solid #5a1535;border-radius:16px;overflow:hidden;">

              <!-- Encabezado -->
              <tr>
                <td align="center" style="padding:32px 40px 24px;background:#1A0D14;
                           border-bottom:1px solid #5a1535;">
                  <span style="font-size:22px;font-weight:700;letter-spacing:6px;
                               text-transform:uppercase;color:#C0206A;">TIXY</span>
                  <span style="font-size:22px;font-weight:300;letter-spacing:6px;
                               text-transform:uppercase;color:#ffffff66;"> GLAMOUR</span>
                  <div style="margin-top:6px;font-size:10px;letter-spacing:4px;
                              text-transform:uppercase;color:#ffffff30;">
                    Sistema de Pedidos
                  </div>
                </td>
              </tr>

              <!-- Cuerpo -->
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#ffffff;">
                    Hola, {nombre} 👋
                  </p>
                  <p style="margin:0 0 24px;font-size:14px;color:#ffffff99;line-height:1.6;">
                    Adjunto encontrarás la orden de pedido <strong style="color:#FAE0EE;">#{order_number}</strong>
                    de <strong style="color:#FAE0EE;">Tixy Glamour</strong>.
                    Por favor revísala y contáctanos si tienes alguna pregunta.
                  </p>

                  <div style="padding:16px;background:#1A0D14;border-radius:8px;border:1px solid #5a1535;">
                    <p style="margin:0;font-size:12px;color:#ffffff50;line-height:1.6;">
                      📧 Este correo fue enviado automáticamente desde el sistema de pedidos de Tixy Glamour.
                      Para consultas, comunícate con tu vendedor directamente.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Pie -->
              <tr>
                <td align="center"
                    style="padding:20px 40px;border-top:1px solid #5a1535;
                           font-size:11px;color:#ffffff25;letter-spacing:2px;">
                  TIXY GLAMOUR © 2026 — Este es un mensaje automático.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    pdf_b64 = base64.b64encode(pdf_bytes).decode()

    resend.Emails.send({
        "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
        "to": [to_email],
        "subject": f"Orden de Pedido #{order_number} — Tixy Glamour",
        "html": html_body,
        "attachments": [{
            "filename": f"tixy-orden-{order_number}.pdf",
            "content":  pdf_b64,
        }],
    })


def send_invitation_email(to_email: str, to_name: str, activation_link: str) -> None:
    """
    Envía el correo de bienvenida / invitación a un nuevo usuario.
    El link lo lleva a la página de activación donde crea su contraseña.
    Lanza una excepción si el envío falla.
    """
    nombre = to_name.split()[0] if to_name else "Usuario"

    html_body = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#1A0D14;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A0D14;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0"
                   style="background:#2a1220;border:1px solid #5a1535;border-radius:16px;overflow:hidden;">

              <!-- Encabezado -->
              <tr>
                <td align="center" style="padding:32px 40px 24px;background:#1A0D14;
                           border-bottom:1px solid #5a1535;">
                  <span style="font-size:22px;font-weight:700;letter-spacing:6px;
                               text-transform:uppercase;color:#C0206A;">TIXY</span>
                  <span style="font-size:22px;font-weight:300;letter-spacing:6px;
                               text-transform:uppercase;color:#ffffff66;"> GLAMOUR</span>
                  <div style="margin-top:6px;font-size:10px;letter-spacing:4px;
                              text-transform:uppercase;color:#ffffff30;">
                    Sistema de Pedidos
                  </div>
                </td>
              </tr>

              <!-- Cuerpo -->
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#ffffff;">
                    ¡Bienvenid@, {nombre}! 🎉
                  </p>
                  <p style="margin:0 0 6px;font-size:14px;color:#ffffff99;line-height:1.6;">
                    Tu cuenta en el Sistema de Pedidos de
                    <strong style="color:#FAE0EE;">Tixy Glamour</strong> ha sido creada.
                  </p>
                  <p style="margin:0 0 24px;font-size:14px;color:#ffffff99;line-height:1.6;">
                    Haz clic en el botón para activar tu cuenta y crear tu contraseña personal.
                  </p>

                  <!-- Botón CTA -->
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" style="padding:8px 0 28px;">
                        <a href="{activation_link}"
                           style="display:inline-block;padding:14px 36px;
                                  background:#C0206A;color:#ffffff;
                                  font-size:14px;font-weight:700;letter-spacing:1px;
                                  text-decoration:none;border-radius:10px;
                                  text-transform:uppercase;">
                          Activar mi cuenta →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Info de seguridad -->
                  <div style="margin-bottom:20px;padding:16px;background:#1a2a1a;
                              border-radius:8px;border:1px solid #2a5a2a;">
                    <p style="margin:0;font-size:12px;color:#88cc88;line-height:1.7;">
                      🔒 <strong>Este enlace es único y personal</strong> — válido por
                      <strong>48 horas</strong>. No lo compartas con nadie.<br>
                      Si no esperabas este correo, puedes ignorarlo de forma segura.
                    </p>
                  </div>

                  <!-- Link alternativo -->
                  <div style="padding:16px;background:#1A0D14;
                              border-radius:8px;border:1px solid #5a1535;">
                    <p style="margin:0 0 6px;font-size:11px;color:#ffffff40;
                               text-transform:uppercase;letter-spacing:2px;">
                      Si el botón no funciona, copia este enlace:
                    </p>
                    <p style="margin:0;font-size:11px;color:#C0206A;word-break:break-all;">
                      {activation_link}
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Pie -->
              <tr>
                <td align="center"
                    style="padding:20px 40px;border-top:1px solid #5a1535;
                           font-size:11px;color:#ffffff25;letter-spacing:2px;">
                  TIXY GLAMOUR © 2026 — Este es un mensaje automático, no respondas este correo.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    resend.Emails.send({
        "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
        "to": [to_email],
        "subject": "Tu acceso al Sistema de Pedidos - Tixy Glamour",
        "html": html_body,
    })
