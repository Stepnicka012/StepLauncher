export const mat4 = {
  create() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },

  identity(out) {
    if (!out) out = new Float32Array(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  },

  copy(out, a) {
    if (!out) out = new Float32Array(16);
    out.set(a);
    return out;
  },

  multiply(out, a, b) {
    if (!out) out = new Float32Array(16);
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

    const b00 = b[0],
      b01 = b[1],
      b02 = b[2],
      b03 = b[3];
    const b10 = b[4],
      b11 = b[5],
      b12 = b[6],
      b13 = b[7];
    const b20 = b[8],
      b21 = b[9],
      b22 = b[10],
      b23 = b[11];
    const b30 = b[12],
      b31 = b[13],
      b32 = b[14],
      b33 = b[15];

    out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

    out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

    out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

    out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;

    return out;
  },

  scale(out, a, v) {
    if (!out) out = new Float32Array(16);
    const x = v[0],
      y = v[1],
      z = v[2];
    if (a === out) {
      out[0] *= x;
      out[1] *= x;
      out[2] *= x;
      out[3] *= x;
      out[4] *= y;
      out[5] *= y;
      out[6] *= y;
      out[7] *= y;
      out[8] *= z;
      out[9] *= z;
      out[10] *= z;
      out[11] *= z;
    } else {
      out[0] = a[0] * x;
      out[1] = a[1] * x;
      out[2] = a[2] * x;
      out[3] = a[3] * x;
      out[4] = a[4] * y;
      out[5] = a[5] * y;
      out[6] = a[6] * y;
      out[7] = a[7] * y;
      out[8] = a[8] * z;
      out[9] = a[9] * z;
      out[10] = a[10] * z;
      out[11] = a[11] * z;
      out[12] = a[12];
      out[13] = a[13];
      out[14] = a[14];
      out[15] = a[15];
    }
    return out;
  },

  translate(out, a, v) {
    if (!out) out = new Float32Array(16);
    const x = v[0],
      y = v[1],
      z = v[2];
    if (a === out) {
      out[12] += a[0] * x + a[4] * y + a[8] * z;
      out[13] += a[1] * x + a[5] * y + a[9] * z;
      out[14] += a[2] * x + a[6] * y + a[10] * z;
      out[15] += a[3] * x + a[7] * y + a[11] * z;
    } else {
      out[0] = a[0];
      out[1] = a[1];
      out[2] = a[2];
      out[3] = a[3];
      out[4] = a[4];
      out[5] = a[5];
      out[6] = a[6];
      out[7] = a[7];
      out[8] = a[8];
      out[9] = a[9];
      out[10] = a[10];
      out[11] = a[11];
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    }
    return out;
  },

  rotate(out, a, rad, axis) {
    if (!out) out = new Float32Array(16);
    let [x, y, z] = axis;
    let len = Math.hypot(x, y, z);
    if (len < 1e-6) return null;
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;
    const s = Math.sin(rad),
      c = Math.cos(rad),
      t = 1 - c;

    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];

    // Construct rotation matrix components
    const b00 = x * x * t + c,
      b01 = y * x * t + z * s,
      b02 = z * x * t - y * s,
      b10 = x * y * t - z * s,
      b11 = y * y * t + c,
      b12 = z * y * t + x * s,
      b20 = x * z * t + y * s,
      b21 = y * z * t - x * s,
      b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;

    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;

    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];

    return out;
  },

  rotateX(out, a, rad) {
    return this.rotate(out, a, rad, [1, 0, 0]);
  },

  rotateY(out, a, rad) {
    return this.rotate(out, a, rad, [0, 1, 0]);
  },

  rotateZ(out, a, rad) {
    return this.rotate(out, a, rad, [0, 0, 1]);
  },

  lookAt(out, eye, center, up) {
    if (!out) out = new Float32Array(16);

    let x = new Float32Array(3);
    let y = new Float32Array(3);
    let z = new Float32Array(3);

    // z = eye - center
    z[0] = eye[0] - center[0];
    z[1] = eye[1] - center[1];
    z[2] = eye[2] - center[2];

    let len = Math.hypot(z[0], z[1], z[2]);
    if (len === 0) {
      z[2] = 1;
    } else {
      z[0] /= len;
      z[1] /= len;
      z[2] /= len;
    }

    // x = up × z
    x[0] = up[1] * z[2] - up[2] * z[1];
    x[1] = up[2] * z[0] - up[0] * z[2];
    x[2] = up[0] * z[1] - up[1] * z[0];

    len = Math.hypot(x[0], x[1], x[2]);
    if (len === 0) {
      if (Math.abs(up[2]) === 1) {
        z[0] += 0.0001;
      } else {
        z[2] += 0.0001;
      }
      x[0] = up[1] * z[2] - up[2] * z[1];
      x[1] = up[2] * z[0] - up[0] * z[2];
      x[2] = up[0] * z[1] - up[1] * z[0];
      len = Math.hypot(x[0], x[1], x[2]);
    }
    x[0] /= len;
    x[1] /= len;
    x[2] /= len;

    // y = z × x
    y[0] = z[1] * x[2] - z[2] * x[1];
    y[1] = z[2] * x[0] - z[0] * x[2];
    y[2] = z[0] * x[1] - z[1] * x[0];

    out[0] = x[0];
    out[1] = y[0];
    out[2] = z[0];
    out[3] = 0;
    out[4] = x[1];
    out[5] = y[1];
    out[6] = z[1];
    out[7] = 0;
    out[8] = x[2];
    out[9] = y[2];
    out[10] = z[2];
    out[11] = 0;
    out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    out[15] = 1;

    return out;
  },

  perspective(out, fovy, aspect, near, far) {
    if (!out) out = new Float32Array(16);
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  },
};
