// Import Libraries
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { storage } = require("../utils/firebase");
const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// Import Utils
const { catchAsync } = require("../utils/catchAsync");
const { AppError } = require("../utils/AppError");
const { filterObj } = require("../utils/filterObj");
const { Email } = require("../utils/email");
const { promisify } = require("util");

// Import Models
const User = require("../models/userModel");
const Image = require("../models/imageModel");

// Login User
exports.loginUser = catchAsync(async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // const user = await User.findOne({ username });

    const user = await User.aggregate([{ $match: { username, active: true } }]);

    const userFilter = user[0];

    const isPasswordValid = await bcrypt.compare(password, userFilter.password);

    const token = jwt.sign({ username: username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN
    });

    if (!user || !isPasswordValid) {
      return next(new AppError(400, "Credentials are invalid"));
    }

    res.status(200).json({
      status: "success",
      userId: userFilter._id,
      token
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "User not found on the database"
    });
  }
});

// Create default image picture
exports.createDefaultImage = catchAsync(async (req, res, next) => {
  const imgRef = ref(storage, `defaultImagePicture/${req.file.originalname}`);

  const result = await uploadBytes(imgRef, req.file.buffer);

  const newImageDefault = await Image.create({
    imageDefault: result.metadata.fullPath
  });

  res.status(201).json({
    status: "success",
    data: {
      imageDefault: newImageDefault
    }
  });
});

// Select default image picture
exports.selectDefaultImage = catchAsync(async (req, res, next) => {
  const img = await Image.find();

  const imgsPromises = img.map(async ({ _id, imageDefault }) => {
    const imgRef = ref(storage, imageDefault);

    const imgDownloadUrl = await getDownloadURL(imgRef);

    return { _id, img: imgDownloadUrl };
  });

  const resolvedImg = await Promise.all(imgsPromises);

  res.status(200).json({
    status: "success",
    data: {
      img: resolvedImg
    }
  });
});

// Create User
exports.createUser = catchAsync(async (req, res, next) => {
  const { firstName, lastName, username, email, password, passwordConfirm } = req.body;

  const imgRef = ref(storage, `imgs-${username}/${Date.now()}-${req.file.originalname}`);

  const result = await uploadBytes(imgRef, req.file.buffer);

  const user = await User.create({
    firstName,
    lastName,
    username,
    email,
    password,
    passwordConfirm,
    img: result.metadata.fullPath
  });

  user.password = undefined;
  user.passwordConfirm = undefined;

  res.status(201).json({
    status: "success",
    data: {
      user
    }
  });
});

// Send email to reset the password
exports.sendEmailResetPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  // const user = await User.findOne({ email });

  const user = await User.aggregate([{ $match: { email, active: true } }]);

  const userFilter = user[0];

  if (!user) {
    return next(new AppError(400, "Credentials are invalid"));
  }

  const token = jwt.sign({ id: userFilter._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN_TOKEN
  });

  await new Email(email)
    .sendWelcome(token)
    .then(() => {
      res.status(200).json({
        status: "success",
        message: "Email sent successfully",
        token
      });
    })
    .catch((err) => {
      console.log(err);
    });
});

// Reset the password
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { password, passwordConfirm } = req.body;

  const { token } = req.params;

  const decodedToken = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const userId = decodedToken.id;

  const salt = await bcrypt.genSalt(12);

  const hashedPassword = await bcrypt.hash(password, salt);

  const hashedPasswordConfirm = await bcrypt.hash(passwordConfirm, salt);

  if (password !== passwordConfirm) {
    return next(new AppError(400, "The passwords are differents"));
  }
  const updateUser = await User.findByIdAndUpdate(userId, {
    password: hashedPassword,
    passwordConfirm: hashedPasswordConfirm,
    passwordChangedAt: Date.now()
  }).select("-password");

  res.status(200).json({
    status: "success",
    data: {
      updateUser
    }
  });
});

// Get All Users
// IMPORTANT: this endpoint will be used for the admin only
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({ active: true }).select("-password");

  const usersPromises = users.map(
    async ({
      _id,
      firstName,
      lastName,
      username,
      email,
      role,
      img,
      occupation,
      biography
    }) => {
      const imgRef = ref(storage, img);

      const imgDownloadUrl = await getDownloadURL(imgRef);

      return {
        _id,
        firstName,
        lastName,
        username,
        email,
        role,
        img: imgDownloadUrl,
        occupation,
        biography
      };
    }
  );

  const resolvedUsers = await Promise.all(usersPromises);

  res.status(200).json({
    status: "success",
    data: {
      length: resolvedUsers.length,
      users: resolvedUsers
    }
  });
});

// Get User by ID
exports.getUserById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.aggregate([{ $match: { _id: ObjectId(id), active: true } }]);

  const userFilter = user[0];

  // const user = await User.findById(id).select("-password");

  if (!user) {
    return next(new AppError(400, "User not found"));
  }

  const imgRef = ref(storage, userFilter.img);

  const imgDownloadUrl = await getDownloadURL(imgRef);

  userFilter.img = imgDownloadUrl;

  userFilter.password = undefined;

  userFilter.passwordConfirm = undefined;

  res.status(200).json({
    status: "success",
    data: {
      user
    }
  });
});

exports.updatePersonalData = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const data = filterObj(
    req.body,
    "firstName",
    "lastName",
    "occupation",
    "email",
    "biography"
  );

  await User.findByIdAndUpdate(id, { ...data });

  res.status(204).json({
    status: "success"
  });
});

exports.updateUserImg = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const user = req.currentUser;

  const imgRef = ref(
    storage,
    `imgs-${user.username}/${Date.now()}-${req.file.originalname}`
  );

  const result = await uploadBytes(imgRef, req.file.buffer);

  const postImgUpdate = await User.findByIdAndUpdate(id, {
    img: result.metadata.fullPath
  });

  if (!postImgUpdate) {
    return next(new AppError(404, "I cant find the user with the given ID"));
  }

  res.status(204).json({
    status: "success"
  });
});

exports.updatePasswordUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);

  const { oldPassword, newPassword, confirmNewPassword } = req.body;

  const validatePassword = await bcrypt.compare(oldPassword, user.password);

  if (!validatePassword) {
    return next(new AppError(400, "The current password is wrong"));
  }

  if (newPassword !== confirmNewPassword) {
    return next(new AppError(400, "The passwords are differents"));
  }

  const salt = await bcrypt.genSalt(12);

  const newPasswordCrypt = await bcrypt.hash(newPassword, salt);

  const confirmNewPasswordCrypt = await bcrypt.hash(confirmNewPassword, salt);

  await User.findOneAndUpdate(
    { username: user.username },
    { password: newPasswordCrypt, passwordConfirm: confirmNewPasswordCrypt }
  );

  res.status(204).json({
    status: "success"
  });
});

// Delete user
exports.deleteUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // This is a soft delete technical
  const userUpdate = await User.findByIdAndUpdate(id, { active: false });

  if (!userUpdate) {
    return next(new AppError(404, "I cant find the user with the given ID"));
  }

  res.status(204).json({
    status: "success"
  });
});
